// ===== TOOL SWITCHER =====
// Tổng quát hóa theo danh sách tab lớn -> thêm tab lớn mới chỉ cần nối thêm 1 cặp [pane,nút]
// ⚠ id nút KHÔNG suy ra từ chỉ số nữa (t23 gộp 2 tab cũ nên tsb3 đã bị gỡ).
const TOOLS=[['t1','tsb1'],['t23','tsb2'],['t4','tsb4'],['t5','tsb5']];
function switchTool(id){
  // T4 nạp dữ liệu cloud lần đầu mở (khỏi tốn request khi không ai vào tab này)
  if(id==='t4'&&typeof SOP!=='undefined')SOP.boot();
  // T5 nạp bài test từ Google Sheet lần đầu mở (mỗi lần gọi là 1 request Apps Script)
  if(id==='t5'&&typeof EX!=='undefined')EX.boot();
  TOOLS.forEach(([t,bid])=>{
    const pane=document.getElementById(t),btn=document.getElementById(bid);
    if(pane){pane.style.display=(t===id)?'':'none';pane.classList.toggle('active',t===id);}
    if(btn)btn.classList.toggle('on',t===id);
  });
  // #t2/#t3 nằm TRONG #t23 -> phải áp lại tab nhỏ đang chọn (t3 mang class .pg,
  // CSS .pg{display:none} nên sw() của T1 gỡ mất .active là trang đen).
  if(id==='t23')switchRp(RP_VIEW);
}

// ===== TAB NHỎ của T23 (Báo Cáo Đại Lý / Lọc File NTK / Điều Kiện Cảnh Báo) =====
// Mỗi tab nhỏ có banner riêng nên hàng tab phải nằm DƯỚI banner của chính nó -> có
// nhiều bản. Trước đây viết tay từng bản, thêm tab thứ 3 là 9 chỗ markup phải khớp.
// Nay khai MỘT chỗ ở RP_TABS và sinh vào mọi container [data-rp-tabs].
// Thêm tab nhỏ mới = thêm 1 dòng vào mảng + 1 div pane có id tương ứng.
let RP_VIEW='bc';
const RP_TABS=[
  ['bc', 'BÁO CÁO ĐẠI LÝ - GỬI FILE','t2'],
  ['ntk','LỌC FILE NTK',             't3'],
  ['kw', 'CẢNH BÁO NE',              'tkw']
];
function renderRpTabs(){
  const html=RP_TABS.map(([v,label])=>
    '<div class="tab rp-tab" data-v="'+v+'" onclick="switchRp(\''+v+'\')">'+label+'</div>').join('');
  document.querySelectorAll('[data-rp-tabs]').forEach(el=>{el.innerHTML=html;});
}
function switchRp(v){
  // không có quyền xem Báo Cáo Đại Lý -> chỉ còn Lọc File NTK
  if(v==='bc'&&typeof canView==='function'&&CUR_PROFILE&&!canView('bc'))v='ntk';
  RP_VIEW=v;
  // Bản dùng chung của Báo Cáo Đại Lý nạp LƯỜI lần đầu mở tab (~0,5 MB) — ai không
  // vào tab này thì không phải tải. BC.boot() tự bỏ qua từ lần thứ hai.
  if(v==='bc'&&window.BC)BC.boot();
  RP_TABS.forEach(([k,,pid])=>{
    const pane=document.getElementById(pid);
    if(pane){pane.style.display=(k===v)?'':'none';pane.classList.toggle('active',k===v);}
  });
  document.querySelectorAll('.rp-tab').forEach(t=>t.classList.toggle('active',t.dataset.v===v));
  if(v==='kw'&&window.WK)WK.shown();
}

// ===== BC NAMESPACE =====
const BC={
  PS:100,
  ROWS:[],AGENTS:[],MAX_MONTH:'',
  fileStore:{f1:[],f2:[],f3:[]},
  filtAll:[],filtAgents:[],pgAll:1,pgAgents:1,

  onDrag(e,id){e.preventDefault();e.stopPropagation();document.getElementById(id).classList.add('dragover');},
  offDrag(id){document.getElementById(id).classList.remove('dragover');},

  onDrop(e,store,dzId,ftId){
    e.preventDefault();e.stopPropagation();BC.offDrag(dzId);
    const files=Array.from(e.dataTransfer.files).filter(f=>f.name.endsWith('.xlsx'));
    if(!files.length){BC.log('⚠ Chỉ chấp nhận file .xlsx');return;}
    files.forEach(f=>BC.addFileToStore(f,store,ftId));BC.checkBtn();
  },

  addFiles(input,store,dzId,ftId){
    Array.from(input.files).forEach(f=>BC.addFileToStore(f,store,ftId));
    document.getElementById(dzId).classList.add('loaded');BC.checkBtn();input.value='';
  },

  addFileToStore(file,store,ftId){
    if(BC.fileStore[store].find(f=>f.name===file.name&&f.size===file.size)){BC.log('Đã có: '+file.name);return;}
    BC.fileStore[store].push(file);
    const idx=BC.fileStore[store].length-1;
    const tag=document.createElement('div');tag.className='file-tag';
    tag.innerHTML=`${file.name.substring(0,22)}${file.name.length>22?'...':''} <span class="rm" onclick="BC.removeFile('${store}',${idx},'${ftId}')">✕</span>`;
    document.getElementById(ftId).appendChild(tag);
    BC.log('Đã thêm: '+file.name);
  },

  removeFile(store,idx,ftId){BC.fileStore[store].splice(idx,1);BC.renderFileTags(store,ftId);BC.checkBtn();},

  renderFileTags(store,ftId){
    const el=document.getElementById(ftId);el.innerHTML='';
    BC.fileStore[store].forEach((f,i)=>{
      const tag=document.createElement('div');tag.className='file-tag';
      tag.innerHTML=`${f.name.substring(0,22)} <span class="rm" onclick="BC.removeFile('${store}',${i},'${ftId}')">✕</span>`;
      el.appendChild(tag);
    });
  },

  checkBtn(){document.getElementById('bc-btn-process').disabled=!BC.fileStore.f2.length;},

  log(msg){
    const el=document.getElementById('bc-upload-log');
    el.classList.remove('hidden');el.textContent+=msg+'\n';el.scrollTop=el.scrollHeight;
  },

  setProgress(pct){
    const bar=document.getElementById('bc-prog-bar');bar.style.display='block';
    document.getElementById('bc-prog-fill').style.width=pct+'%';
    if(pct>=100)setTimeout(()=>{bar.style.display='none';},800);
  },

  readXlsx(file){
    return new Promise((res,rej)=>{
      const reader=new FileReader();
      reader.onload=e=>{
        try{
          const wb=XLSX.read(e.target.result,{type:'array',cellDates:true});
          const ws=wb.Sheets[wb.SheetNames[0]];
          res(XLSX.utils.sheet_to_json(ws,{defval:''}));
        }catch(err){rej(err);}
      };
      reader.onerror=rej;reader.readAsArrayBuffer(file);
    });
  },

  // Dò cột theo tên: khớp CHÍNH XÁC trước, sau đó khớp CHỨA (chịu được hậu tố kiểu "(GMT+8)",
  // khác hoa/thường, thừa khoảng trắng). Trả về giá trị ô, '' nếu không có cột nào khớp.
  pick(row,names){
    for(const n of names)if(row[n]!==undefined)return row[n];
    const keys=Object.keys(row);
    const norm=s=>String(s).toLowerCase().replace(/\s+/g,' ').trim();
    for(const n of names){
      const t=norm(n);
      const k=keys.find(k=>norm(k)===t)||keys.find(k=>norm(k).includes(t));
      if(k!==undefined)return row[k];
    }
    return '';
  },

  // Đọc ngày từ ô Excel. ⚠ KHÔNG dùng thẳng new Date(chuỗi) cho "dd/mm/yyyy" —
  // trình duyệt đọc kiểu Mỹ (mm/dd) nên 05/08/2026 thành THÁNG 5, sai tháng nạp đầu.
  parseDate(v){
    if(v instanceof Date)return isNaN(v)?null:v;
    if(typeof v==='number'&&v>0)return new Date(Math.round((v-25569)*86400*1000));
    if(typeof v!=='string')return null;
    const s=v.trim();if(!s)return null;
    let m=s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);            // yyyy-mm-dd
    if(m)return new Date(+m[1],+m[2]-1,+m[3]);
    m=s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);                 // dd/mm/yyyy (chuẩn VN)
    if(m)return new Date(+m[3],+m[2]-1,+m[1]);
    const d=new Date(s);return isNaN(d)?null:d;
  },

  async processFiles(){
    // Kết quả ghi đè BẢN DÙNG CHUNG của cả đội -> khoá theo vai trò, không theo ô tích quyền
    if(!BC.canManage()){alert('Chỉ ADMIN và Tổ Trưởng mới được tính toán dữ liệu báo cáo đại lý.');return;}
    BC.showOverlay('Đang đọc file...');BC.setProgress(5);BC.log('\n🔄 Bắt đầu xử lý...');
    try{
      const seen=new Set();
      const allFiles=[...BC.fileStore.f1,...BC.fileStore.f2,...BC.fileStore.f3]
        .filter(f=>{const k=f.name+'|'+f.size;if(seen.has(k))return false;seen.add(k);return true;});
      if(!allFiles.length){BC.hideOverlay();BC.log('❌ Chưa có file nào!');return;}
      BC.log(`  📦 ${allFiles.length} file`);
      let df1=[],df2=[],df3=[];
      for(const file of allFiles){
        BC.log(`  📖 ${file.name}`);
        const rows=await BC.readXlsx(file);
        if(!rows.length){BC.log('  ⚠ File rỗng');continue;}
        const cols=Object.keys(rows[0]);const n=cols.length;
        if(cols.some(c=>c.includes('ảnh'))||cols.some(c=>c.includes('nh')&&c.includes('tr')&&c.includes('ch'))){
          df3.push(...rows);BC.log(`  ✅ [Game] ${rows.length} dòng`);
        }else if(n<=10&&(cols[0].includes('kho')||cols[0].toLowerCase().includes('tai')||cols[0].includes('account'))){
          df1.push(...rows);BC.log(`  ✅ [Thành viên] ${rows.length} dòng`);
        }else if(n>=10||cols.some(c=>c.includes('gửi')||c.includes('nhuợng'))){
          df2.push(...rows);BC.log(`  ✅ [Báo cáo] ${rows.length} dòng`);
        }else{
          BC.log(`  ❓ Fallback: ${cols.slice(0,3).join('|')}`);
          if(n<=10)df1.push(...rows);else df2.push(...rows);
        }
      }
      BC.setProgress(40);
      BC.log(`  TV=${df1.length} BáoCáo=${df2.length} Game=${df3.length}`);
      if(!df2.length){BC.hideOverlay();BC.log('❌ Không tìm thấy file Báo cáo thành viên!');return;}
      BC.overlayMsg('Đang tính toán...');BC.setProgress(55);

      const memMap={};
      df2.forEach(row=>{
        const agent=row['Bên nhượng quyền']||'';const user=row['Thành viên']||'';
        if(!agent||!user)return;
        const key=agent+'|||'+user;
        if(!memMap[key])memMap[key]={dai_ly:agent,id:user,cap_bac:row['cấp thành viên']||'',lan_nap:0,tien_nap:0,lan_rut:0,tien_rut:0,cuoc_hop_le:0};
        const m=memMap[key];
        m.lan_nap+=Number(row['Số lần gửi tiền'])||0;
        m.tien_nap+=Number(row['Tổng số tiền gửi'])||0;
        m.lan_rut+=Number(row['Số lần rút tiền'])||0;
        m.tien_rut+=Number(row['Số tiền rút'])||0;
        m.cuoc_hop_le+=Number(row['Tổng số tiền đặt cược hợp lệ'])||0;
      });

      const infoMap={};
      df1.forEach(row=>{
        const u=row['số tài khoản']||'';if(!u)return;
        const linkDn=String(row['URL nguồn-Đăng nhập']||'');
        const thiet_bi=linkDn.split('://').pop().startsWith('m.')?'Điện thoại':'Máy tính';
        const regDate=BC.parseDate(BC.pick(row,['Thời gian gửi tiền thực tế đầu tiên',
          'Thời gian gửi tiền đầu tiên','Thời gian nạp đầu tiên','Lần gửi tiền đầu tiên',
          'gửi tiền thực tế đầu tiên','nạp đầu tiên']));
        infoMap[u]={ho_ten:row['tên thật']||'',ip:row['IP đăng nhập lần cuối']||'',
          link_dk:row['Đăng ký URL nguồn']||'',link_dn:linkDn,
          ngan_hang:row['Ngân hàng_1']||'',chi_nhanh:row['Ngân hàng_1 - Quận']||'',
          stk:String(row['Ngân hàng_1 - Tài khoản']||''),thiet_bi,regDate};
      });

      let maxTs=0,nReg=0;
      Object.values(infoMap).forEach(m=>{if(m.regDate){nReg++;if(m.regDate.getTime()>maxTs)maxTs=m.regDate.getTime();}});
      const maxDate=maxTs?new Date(maxTs):new Date();
      const maxM=maxDate.getFullYear()+'-'+(String(maxDate.getMonth()+1).padStart(2,'0'));
      BC.log(`  📅 Tháng hiện tại: ${maxM}${maxTs?'':' (không có ngày nạp đầu → lấy theo đồng hồ máy)'}`);
      // Không đọc được ngày nạp đầu = MỌI khách bị gắn "Cũ" âm thầm → phải báo, đừng để trượt im lặng.
      if(!nReg&&df1.length){
        BC.log('  ⚠ KHÔNG đọc được cột "Thời gian gửi tiền thực tế đầu tiên" → tất cả sẽ là khách CŨ!');
        BC.log('     Cột có trong file: '+Object.keys(df1[0]).join(' | '));
      }else{
        BC.log(`  🗓 Có ngày nạp đầu: ${nReg}/${Object.keys(infoMap).length} tài khoản`);
      }

      const gameMap={};
      df3.forEach(row=>{
        const agent=row['Bên nhượng quyền']||'',user=row['Thành viên']||'',game=row['Sảnh trò chơi']||'';
        const bet=Number(row['Tổng số tiền đặt cược'])||0;
        if(!agent||!user||!game)return;
        const key=agent+'|||'+user;
        if(!gameMap[key])gameMap[key]={};
        gameMap[key][game]=(gameMap[key][game]||0)+bet;
      });
      const gameTop2={};
      Object.keys(gameMap).forEach(k=>{
        gameTop2[k]=Object.entries(gameMap[k]).sort((a,b)=>b[1]-a[1]).slice(0,2).map(x=>x[0]).join(' / ');
      });
      BC.setProgress(75);

      const members=Object.values(memMap);
      members.forEach(m=>{
        m.am_duong=m.tien_nap-m.tien_rut;
        m.hop_le=m.tien_nap>=1000&&m.cuoc_hop_le>=3000;
        m.chi_tieu=m.hop_le?'Đạt':'Không đạt';
        const info=infoMap[m.id]||{};
        Object.assign(m,{ho_ten:info.ho_ten||'',ip:info.ip||'',link_dk:info.link_dk||'',
          link_dn:info.link_dn||'',ngan_hang:info.ngan_hang||'',chi_nhanh:info.chi_nhanh||'',
          stk:info.stk||'',thiet_bi:info.thiet_bi||'Máy tính'});
        // Khách MỚI = nạp tiền lần ĐẦU trong tháng hiện tại (maxM); nạp đầu ở tháng trước = Khách CŨ.
        // Không có ngày nạp đầu → xếp Cũ (đã cảnh báo ở log phía trên).
        const rd=info.regDate;
        m.khach=rd&&(rd.getFullYear()+'-'+String(rd.getMonth()+1).padStart(2,'0'))===maxM?'Mới':'Cũ';
        m.game=gameTop2[m.dai_ly+'|||'+m.id]||'';
      });

      const agentValid={};
      members.forEach(m=>{if(!agentValid[m.dai_ly])agentValid[m.dai_ly]=0;if(m.hop_le)agentValid[m.dai_ly]++;});
      BC.log(`  👥 Khách mới: ${members.filter(m=>m.khach==='Mới').length} · Khách cũ: ${members.filter(m=>m.khach==='Cũ').length}`);
      const qualified=new Set(Object.keys(agentValid).filter(a=>agentValid[a]>=3));
      BC.log(`  ✅ Đại lý đủ điều kiện: ${qualified.size}`);

      /* HIỆN MỌI THÀNH VIÊN CỦA MỌI ĐẠI LÝ (chốt 17/09/2026). Bản cũ lọc bỏ khách không hợp lệ
         và cả đại lý có < 3 KH hợp lệ -> đại lý có đủ thông tin trong file mà biến mất khỏi báo
         cáo, bảng Phân Công báo "Không có trong bản hiện tại". Nay điều kiện chỉ còn là NHÃN:
         cột Chỉ tiêu Đạt / Không đạt. Thẻ tổng ở Tổng Hợp vẫn chỉ tính KH hợp lệ của đại lý đủ
         điều kiện (BC.qualifiedRows) để số báo cáo không đổi nghĩa. */
      BC.ROWS=members.slice()
        .sort((a,b)=>a.dai_ly.localeCompare(b.dai_ly)||b.tien_nap-a.tien_nap);

      const agSum={};
      members.forEach(m=>{
        if(!agSum[m.dai_ly])agSum[m.dai_ly]={dai_ly:m.dai_ly,tong_thanh_vien:0,khach_hop_le:0,tong_nap:0,tong_rut:0,am_duong:0,cuoc_hop_le:0,khach_moi:0,khach_cu:0};
        const a=agSum[m.dai_ly];a.tong_thanh_vien++;
        if(m.hop_le)a.khach_hop_le++;
        a.tong_nap+=m.tien_nap;a.tong_rut+=m.tien_rut;a.am_duong+=m.am_duong;a.cuoc_hop_le+=m.cuoc_hop_le;
        if(m.khach==='Mới')a.khach_moi++;else a.khach_cu++;
      });
      BC.AGENTS=Object.values(agSum).sort((a,b)=>a.dai_ly.localeCompare(b.dai_ly));
      BC.MAX_MONTH=maxM;BC.setProgress(90);

      BC.filtAll=[...BC.ROWS];BC.filtAgents=[...BC.AGENTS];BC.pgAll=1;BC.pgAgents=1;
      BC.log(`  📊 Tổng thành viên: ${BC.ROWS.length} · KH hợp lệ (đại lý đủ điều kiện): ${BC.qualifiedRows().length}`);BC.log('✅ Xong!');BC.setProgress(100);
      /* Tính lại = bộ số MỚI, chỉ số dòng đổi hết ⇒ ô đã tô của bản cũ không còn nghĩa */
      BC.MARKS={};
      BC.hideOverlay();BC.rebuildAll();
      /* Lưu lên cloud để CẢ ĐỘI thấy cùng một bản (xem khối "BẢN DÙNG CHUNG" bên dưới) */
      await BC.cloudSave();
    }catch(err){BC.hideOverlay();BC.log('❌ Lỗi: '+err.message);console.error(err);}
  },

  /* ================= BẢN DÙNG CHUNG TRÊN CLOUD (chốt 16/09/2026) =================
     Trước đây kết quả "Tính toán" chỉ nằm trong RAM của người vừa bấm: F5 là mất,
     người khác mở dashboard thấy bảng TRỐNG nên không lấy số đi báo cáo được.
     Nay ĐÚNG MỘT bản dùng chung: reports type='bc' month='current'.
       · Tính xong  -> ghi đè bản dùng chung, cả đội thấy ngay ở lần mở tab kế tiếp.
       · Xóa Dữ Liệu -> ghi BẢN RỖNG (không xoá dòng): cùng đường GHI nên Tổ Trưởng
         dùng được, khỏi phải nới policy XOÁ vốn dùng chung cho mọi loại dữ liệu.
     Ô đã tô (MARKS) để ở report RIÊNG 'bc_marks' — mỗi lần bấm tô là một lượt ghi,
     nhét chung vào bản 'bc' (~0,5 MB) thì mỗi cú bấm đẩy nửa MB lên mạng.
     ⚠ Chỉ ADMIN + Tổ Trưởng được tính / xoá (RLS chặn lại lần nữa ở máy chủ). */
  CLOUD_MONTH:'current',
  _booted:false,
  /* Nhân viên: {assigned:[tên đại lý được giao], done:Set(đại lý đã vào Nghi Ngờ)} do bc_my_view()
     trả về. null = đang là ADMIN/Tổ Trưởng (xem toàn bộ). */
  MY:null,
  renderMyNote(){
    const el=document.getElementById('bc-my-note');
    if(!el)return;
    if(!BC.MY){el.style.display='none';return;}
    const n=BC.MY.assigned.length;
    el.style.display='';
    el.textContent=n
      ?'Bạn đang xem '+n+' đại lý được phân công: '+BC.MY.assigned.join(', ')
      :'Bạn chưa được phân công đại lý nào. Liên hệ Tổ Trưởng để được phân công.';
  },
  /* Khoá theo VAI TRÒ chứ không theo canEdit('bc'): ô tích quyền có thể được bật cho
     nhân viên, mà bản này là của CẢ ĐỘI. Giống nút "Báo Cáo ⇢ Google Sheet". */
  canManage(){
    if(!CUR_PROFILE)return true;                       // chưa đăng nhập (mở file rời) — không chặn
    const rl=typeof roleOf==='function'?roleOf(CUR_PROFILE):null;
    return !!(CUR_PROFILE.is_admin||(rl&&rl.key==='totruong'));
  },
  _chuaLuu:false,
  setBadge(txt,mau){
    // Nhớ luôn trạng thái "chưa lưu được" -> boot() không được kéo bản cloud về đè lên
    // kết quả người ta vừa tính mà máy chủ chưa nhận (mất công tính lại từ đầu).
    BC._chuaLuu=(txt==='CHƯA LƯU');
    const b=document.getElementById('bc-ds-badge');
    if(!b)return;
    b.textContent=txt;b.style.background=mau;b.style.color='white';
  },
  /* Set không đi qua JSON được -> đổi sang mảng khi ghi, dựng lại Set khi đọc */
  marksToJson(){
    const o={};
    Object.keys(BC.MARKS).forEach(ag=>{const a=[...BC.MARKS[ag]];if(a.length)o[ag]=a;});
    return o;
  },
  marksFromJson(o){
    BC.MARKS={};
    Object.keys(o||{}).forEach(ag=>{BC.MARKS[ag]=new Set(o[ag]||[]);});
  },

  async cloudSave(){
    if(!SB.ready()){BC.log('☁ Chưa kết nối cloud — bản này chỉ nằm trên máy bạn.');BC.setBadge('CHƯA LƯU','#ef4444');return false;}
    try{
      // Bản đang dùng chung là của cả đội -> nói rõ sẽ thay thế của ai, tính lúc nào
      let cu=null;
      try{cu=await SB.loadReport('bc',BC.CLOUD_MONTH);}catch(e){}
      if(cu&&(cu.ROWS||[]).length){
        const ai=cu.by?' (do '+cu.by+' tính'+(cu.at?' lúc '+new Date(cu.at).toLocaleString('vi-VN'):'')+')':'';
        if(!confirm('THAY THẾ BẢN DÙNG CHUNG\n\nTrên cloud đang có bản '+(cu.ROWS||[]).length+' thành viên'+ai+'.\n\nKết quả vừa tính sẽ THAY THẾ bản đó cho toàn đội. Tiếp tục?')){
          BC.log('☁ Không lưu — giữ nguyên bản dùng chung trên cloud.');
          BC.setBadge('CHƯA LƯU','#ef4444');
          return false;
        }
      }
      BC.log('☁ Đang lưu bản dùng chung lên cloud...');
      await SB.saveReport('bc',BC.CLOUD_MONTH,{
        ROWS:BC.ROWS,AGENTS:BC.AGENTS,MAX_MONTH:BC.MAX_MONTH,
        at:new Date().toISOString(),by:CUR_PROFILE?CUR_PROFILE.username:''
      });
      await SB.saveReport('bc_marks',BC.CLOUD_MONTH,{marks:BC.marksToJson()});
      BC.setBadge('CLOUD '+(BC.MAX_MONTH?dispMonth(BC.MAX_MONTH):''),'#7c3aed');
      BC.log('☁ Đã lưu cloud — cả đội đều thấy bản này ✓');
      logAction('Lưu báo cáo đại lý (bản dùng chung)',(BC.MAX_MONTH?'Tháng '+dispMonth(BC.MAX_MONTH)+' · ':'')+BC.ROWS.length+' thành viên · '+BC.AGENTS.length+' đại lý');
      return true;
    }catch(e){
      // Số vẫn hiện trên màn hình NHƯNG chỉ ở máy này -> nhãn phải nói đúng điều đó,
      // không thì người dùng tưởng cả đội đã thấy (luật saveFailed, CLAUDE.md).
      BC.setBadge('CHƯA LƯU','#ef4444');
      BC.log('☁ Lỗi lưu cloud: '+(e.message||e));
      saveFailed('Báo cáo đại lý (bản dùng chung) — kết quả mới chỉ nằm trên máy bạn, bấm Tính toán lại để thử lưu lần nữa',e);
      return false;
    }
  },

  /* Nạp bản dùng chung. Gọi LƯỜI (lần đầu mở tab) để người không dùng tab này
     không phải tải ~0,5 MB lúc đăng nhập. */
  _lastLoad:0,
  async boot(){
    if(!SB.ready()||BC._chuaLuu)return;
    // Nạp lại khi mở tab nếu bản trong máy đã cũ hơn 60 giây: người khác vừa tính lại
    // thì mình thấy bản mới mà không phải F5. Mở tab liên tục không tải lại liên tục.
    if(BC._booted&&Date.now()-BC._lastLoad<60000)return;
    BC._booted=true;BC._lastLoad=Date.now();
    await BC.cloudLoad(true);
  },
  async cloudLoad(quiet){
    if(!SB.ready())return false;
    try{
      if(!quiet)BC.showOverlay('Đang tải bản dùng chung từ cloud...');
      let d,mk={};
      if(BC.canManage()){
        // ADMIN + Tổ Trưởng: đọc thẳng toàn bộ bản dùng chung
        d=await SB.loadReport('bc',BC.CLOUD_MONTH);
        try{const m=await SB.loadReport('bc_marks',BC.CLOUD_MONTH);mk=(m&&m.marks)||{};}catch(e){}
        BC.MY=null;
      }else{
        // NHÂN VIÊN: máy chủ lọc sẵn theo Phân Công Check Đại Lý (supabase_bc_assign.sql).
        // ⛔ Đừng "tối ưu" bằng cách đọc thẳng rồi lọc ở đây: RLS đã khoá đọc thẳng, và lọc
        //    trên máy khách thì dữ liệu đại lý khác vẫn nằm trong trình duyệt (F12 là thấy).
        const r=await SB.client().rpc('bc_my_view');
        if(r.error)throw r.error;
        d=r.data||{};mk=d.MARKS||{};
        BC.MY={assigned:d.ASSIGNED||[],done:new Set(d.DONE||[])};
      }
      BC.renderMyNote();
      BC.ROWS=(d&&d.ROWS)||[];BC.AGENTS=(d&&d.AGENTS)||[];BC.MAX_MONTH=(d&&d.MAX_MONTH)||'';
      BC.marksFromJson(mk);
      BC.filtAll=[...BC.ROWS];BC.filtAgents=[...BC.AGENTS];BC.pgAll=1;BC.pgAgents=1;
      BC.hideOverlay();
      if(BC.ROWS.length){
        BC.setBadge('CLOUD '+(BC.MAX_MONTH?dispMonth(BC.MAX_MONTH):''),'#7c3aed');
        BC.log('☁ Đã tải bản dùng chung: '+BC.ROWS.length+' thành viên'+(d&&d.by?' (do '+d.by+' tính)':'')+' ✓');
      }else{
        BC.setBadge('TRỐNG','#9ca3af');
      }
      BC.rebuildAll();
      return true;
    }catch(e){
      console.error('BC.cloudLoad',e);
      BC.hideOverlay();
      // Đường ĐỌC hỏng không mất dữ liệu gì -> báo bằng dòng log, không chặn màn hình
      BC.log('☁ Lỗi tải bản dùng chung: '+(e.message||e));
      return false;
    }
  },

  async resetToDefault(){
    if(!BC.canManage()){alert('Chỉ ADMIN và Tổ Trưởng mới được xóa dữ liệu báo cáo đại lý.');return;}
    const con=BC.ROWS.length;
    if(con&&!confirm('XÓA BẢN DÙNG CHUNG CỦA CẢ ĐỘI\n\nBản đang có trên cloud ('+con+' thành viên · '+BC.AGENTS.length+' đại lý) sẽ bị xóa, kể cả các ô đã tô.\nMọi người sẽ thấy bảng TRỐNG cho tới lần tính toán kế tiếp.\n\nTiếp tục xóa?'))return;
    // Xóa trên CLOUD trước: hỏng mà đã dọn màn hình thì người xóa tưởng xong,
    // trong khi cả đội vẫn thấy bản cũ.
    if(SB.ready()){
      try{
        await SB.saveReport('bc',BC.CLOUD_MONTH,{ROWS:[],AGENTS:[],MAX_MONTH:'',at:new Date().toISOString(),by:CUR_PROFILE?CUR_PROFILE.username:''});
        await SB.saveReport('bc_marks',BC.CLOUD_MONTH,{marks:{}});
        logAction('Xóa báo cáo đại lý (bản dùng chung)',con+' thành viên · '+BC.AGENTS.length+' đại lý');
      }catch(e){
        BC.log('☁ Lỗi xóa trên cloud: '+(e.message||e));
        saveFailed('Xóa báo cáo đại lý (bản dùng chung) — cả đội VẪN đang thấy bản cũ',e);
        return;                      // giữ nguyên màn hình cho khớp với cloud
      }
    }
    BC.ROWS=[];BC.AGENTS=[];BC.MAX_MONTH='';BC.MARKS={};
    BC.filtAll=[];BC.filtAgents=[];BC.pgAll=1;BC.pgAgents=1;
    ['f1','f2','f3'].forEach(k=>BC.fileStore[k]=[]);
    ['bc-ft1','bc-ft2','bc-ft3'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML='';});
    ['bc-dz1','bc-dz2','bc-dz3'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.remove('loaded');});
    const ul=document.getElementById('bc-upload-log');ul.textContent='';ul.classList.add('hidden');
    document.getElementById('bc-btn-process').disabled=true;
    BC.setBadge('TRỐNG','#9ca3af');
    BC.rebuildAll();BC.log('↺ Đã xóa bản dùng chung. Upload file mới để tính toán.');
  },

  fmt(n){return(n===null||n===undefined||n==='')?'':Number(n).toLocaleString('vi-VN');},

  ad(n){
    if(n<0)return`<span class="pos">+${BC.fmt(Math.abs(n))}</span>`;
    if(n>0)return`<span class="neg">-${BC.fmt(n)}</span>`;
    return`<span style="color:#888">0</span>`;
  },

  /* Nền tối phân biệt từng đại lý — 8 sắc thái đậm khác hue, chữ trắng vẫn đọc rõ */
  AGENT_COLORS:['#10162e','#0e2233','#12291f','#241733','#2b2414','#0e2b2e','#2b1520','#1a2038'],

  rowHtml(r,i,isFirst,isLast,agSpan){
    const tb=r.thiet_bi==='Điện thoại'?'Điện Thoại':'Máy Tính';
    const kh=r.khach==='Mới'?'<span class="b-moi">Mới</span>':'<span class="b-cu">Cũ</span>';
    const ct=r.chi_tieu==='Đạt'?'<span class="b-dat">Đạt</span>':'<span class="b-khong">Không đạt</span>';
    /* Ô đại lý gộp (rowspan): tên click được -> Kiểm Tra Đại Lý; ADMIN có ô tích Nghi Ngờ */
    let agCell='';
    if(isFirst){
      const ag=String(r.dai_ly).replace(/'/g,"\\'");
      const flagged=BC.isSuspect(r.dai_ly);
      const chk=(CUR_PROFILE&&CUR_PROFILE.is_admin)
        ?`<label style="display:flex;align-items:center;justify-content:center;gap:4px;font-size:9px;color:${flagged?'#f87171':'var(--mu2)'};cursor:pointer;font-weight:700"><input type="checkbox" ${flagged?'checked':''} onchange="BC.toggleSuspect('${ag}',this)" style="accent-color:#ef4444;cursor:pointer">Nghi ngờ</label>`
        :'';
      /* Đại lý đã đưa vào tab Nghi Ngờ -> nhãn xanh "Đã Xử Lý" (mọi vai trò đều thấy, kể cả khi không có ô tích) */
      const done=flagged?'<span class="bc-done" title="Đại lý đã được đưa vào danh sách Nghi Ngờ để xử lý">Đã Xử Lý</span>':'';
      agCell=`<td rowspan="${agSpan||1}" style="vertical-align:middle">
        <div style="display:flex;flex-direction:column;align-items:center;gap:5px;padding:2px">
          <b style="cursor:pointer;color:#9f67ff;text-decoration:underline" title="Bấm để kiểm tra đại lý" onclick="BC.goAgent('${ag}')">${hesc(r.dai_ly)}</b>
          ${chk}${done}
        </div>
      </td>`;
    }
    const cls='ag-row'+(isFirst?' ag-first':'')+(isLast?' ag-last':'');
    return`<tr class="${cls}">
      <td class="tc stt">${i}</td>${agCell}<td>${hesc(r.id)}</td>
      <td class="ell">${hesc(r.cap_bac)}</td><td>${hesc(r.ho_ten)}</td>
      <td>${kh}</td><td>${ct}</td>
      <td>${BC.fmt(r.tien_nap)}</td><td>${r.lan_nap}</td>
      <td>${BC.fmt(r.tien_rut)}</td><td>${r.lan_rut}</td>
      <td>${BC.ad(r.am_duong)}</td><td>${BC.fmt(r.cuoc_hop_le)}</td>
      <td>${hesc(r.ngan_hang)}</td><td>${hesc(r.chi_nhanh)}</td><td>${hesc(r.stk)}</td>
      <td style="font-size:10px">${hesc(r.ip)}</td>
      <td>${tb}</td>
      <td class="ell" title="${hesc(r.link_dk)}" style="font-size:10px">${hesc(r.link_dk)}</td>
      <td class="ell" title="${hesc(r.link_dn)}" style="font-size:10px">${hesc(r.link_dn)}</td>
      <td>${hesc(r.game)}</td></tr>`;
  },

  renderAll(){
    const s=(BC.pgAll-1)*BC.PS,e=s+BC.PS;
    const slice=BC.filtAll.slice(s,e);
    /* Gộp ô đại lý: đếm số dòng liên tiếp cùng đại lý trong trang -> khung viền xanh bao mỗi đại lý */
    let html='',i2=0;
    while(i2<slice.length){
      const ag=slice[i2].dai_ly;
      let j=i2;
      while(j<slice.length&&slice[j].dai_ly===ag)j++;
      const span=j-i2;
      for(let k=i2;k<j;k++)html+=BC.rowHtml(slice[k],s+k+1,k===i2,k===j-1,span);
      i2=j;
    }
    document.getElementById('bc-body-all').innerHTML=html;
    document.getElementById('bc-cnt-all').textContent=BC.filtAll.length+' kết quả'+(BC.multiInfo||'');
    BC.renderPg('bc-pg-all',BC.filtAll.length,BC.pgAll,p=>{BC.pgAll=p;BC.renderAll();});
  },

  /* CHỈ tab Tổng Hợp: dán nhiều tên đại lý (ngăn bằng dấu phẩy / xuống dòng / tab / chấm phẩy)
     -> lọc theo ĐÚNG tên đại lý, dán bao nhiêu hiện bấy nhiêu. 1 từ khoá = tìm thường như cũ. */
  filterAll(){
    const raw=document.getElementById('bc-s-all').value.trim();
    const parts=raw.split(/[,;\n\r\t]+/).map(s=>s.trim()).filter(Boolean);
    BC.multiInfo='';
    if(parts.length>1){
      const want=new Set(parts.map(s=>s.toLowerCase()));
      BC.filtAll=BC.ROWS.filter(r=>want.has((r.dai_ly||'').toLowerCase()));
      const found=new Set(BC.filtAll.map(r=>(r.dai_ly||'').toLowerCase()));
      const miss=parts.filter(p=>!found.has(p.toLowerCase()));
      BC.multiInfo=` · ${found.size}/${want.size} đại lý`+(miss.length?` · không thấy: ${miss.join(', ')}`:'');
    }else{
      const q=raw.toLowerCase();
      BC.filtAll=q?BC.ROWS.filter(r=>r.id.toLowerCase().includes(q)||r.ho_ten.toLowerCase().includes(q)||r.dai_ly.toLowerCase().includes(q)||(r.ngan_hang||'').toLowerCase().includes(q)):[...BC.ROWS];
    }
    BC.pgAll=1;BC.renderAll();
  },

  renderAgents(){
    const s=(BC.pgAgents-1)*BC.PS,e=s+BC.PS;
    document.getElementById('bc-body-agents').innerHTML=BC.filtAgents.slice(s,e).map((a,i)=>{
      const ad2=a.am_duong<0?`<span class='pos'>+${BC.fmt(Math.abs(a.am_duong))}</span>`:`<span class='neg'>-${BC.fmt(a.am_duong)}</span>`;
      return`<tr><td class="tc stt">${s+i+1}</td><td><b>${hesc(a.dai_ly)}</b></td>
        <td class="tc">${a.tong_thanh_vien}</td><td class="tc"><b style="color:#9f67ff">${a.khach_hop_le}</b></td>
        <td class="tc"><span class="b-moi">${a.khach_moi}</span></td>
        <td class="tc"><span class="b-cu">${a.khach_cu}</span></td>
        <td class="tc">${BC.fmt(a.tong_nap)}</td><td class="tc">${BC.fmt(a.tong_rut)}</td>
        <td class="tc">${ad2}</td><td class="tc">${BC.fmt(Math.round(a.cuoc_hop_le))}</td>
        <td class="tc"><button class="view-btn" onclick="BC.goAgent('${a.dai_ly}')">Xem</button></td></tr>`;
    }).join('');
    document.getElementById('bc-cnt-agents').textContent=BC.filtAgents.length+' đại lý';
    BC.renderPg('bc-pg-agents',BC.filtAgents.length,BC.pgAgents,p=>{BC.pgAgents=p;BC.renderAgents();});
  },

  filterAgents(){
    const q=document.getElementById('bc-s-agents').value.toLowerCase();
    BC.filtAgents=q?BC.AGENTS.filter(a=>a.dai_ly.toLowerCase().includes(q)):[...BC.AGENTS];
    BC.pgAgents=1;BC.renderAgents();
  },

  /* ---- Tô ô nghi ngờ trong Kiểm Tra Đại Lý — LƯU CLOUD (chốt 16/09/2026) ----
     MARKS[agent] = Set("rowIdx|field") · bấm ô để tô/bỏ tô · khi gửi báo cáo Telegram,
     genExcel tô đúng các ô này (cam, riêng Âm/Dương đỏ nhạt).
     Lưu ở report RIÊNG 'bc_marks' (nhỏ) chứ không nhét vào bản 'bc' ~0,5 MB.
     Ghi GỘP sau 600ms: tô liền tay 20 ô thì chỉ tốn 1 lượt ghi, không phải 20. */
  MARKS:{},
  _mkTimer:null,
  mkSet(ag){return BC.MARKS[ag]||(BC.MARKS[ag]=new Set());},
  mkAttr(ag,i,f,cls){
    const on=BC.mkSet(ag).has(i+'|'+f);
    return `class="bc-mkc${cls?' '+cls:''}${on?(f==='am_duong'?' bc-mk-ad':' bc-mk'):''}" onclick="BC.markCell(this,${i},'${f}')"`;
  },
  markCell(td,i,f){
    const ag=document.getElementById('bc-agent-select').value;
    if(!ag)return;
    // MỌI vai trò tô được (17/09/2026). Nhân viên chỉ có dữ liệu của đại lý được giao, và máy chủ
    // (bc_mark_set) chặn lại lần nữa nếu đại lý không nằm trong phân công.
    const s=BC.mkSet(ag),k=i+'|'+f;
    if(s.has(k)){s.delete(k);td.classList.remove('bc-mk','bc-mk-ad');}
    else{s.add(k);td.classList.add(f==='am_duong'?'bc-mk-ad':'bc-mk');}
    BC.saveMarksSoon(ag);
  },
  /* Ghi gộp sau 600ms, THEO TỪNG ĐẠI LÝ qua RPC bc_mark_set (supabase_bc_marks_nv.sql): máy chủ chỉ
     thay đúng đại lý đó -> nhiều người tô nhiều đại lý cùng lúc không ghi đè ô của nhau.
     ⚠ Đừng quay lại gửi CẢ bộ MARKS bằng saveReport: nhân viên không có quyền ghi loại đó,
     và bản trong máy người này có thể thiếu ô người khác vừa tô. */
  _mkDirty:new Set(),
  saveMarksSoon(ag){
    if(!SB.ready())return;
    if(ag)BC._mkDirty.add(ag);
    clearTimeout(BC._mkTimer);
    BC._mkTimer=setTimeout(async()=>{
      const ds=[...BC._mkDirty];BC._mkDirty.clear();
      for(const a of ds){
        const cells=[...BC.mkSet(a)];
        try{
          const r=await SB.client().rpc('bc_mark_set',{p_agent:a,p_cells:cells});
          if(r.error){
            // Chưa chạy SQL (hàm chưa có) mà là ADMIN/TT -> ghi theo cách cũ để không gãy chức năng đang dùng
            if(BC.canManage()&&/bc_mark_set|PGRST202|function/i.test((r.error.code||'')+' '+(r.error.message||''))){
              await SB.saveReport('bc_marks',BC.CLOUD_MONTH,{marks:BC.marksToJson()});
            }else throw r.error;
          }
        }catch(e){
          saveFailed('Tô ô nghi ngờ đại lý '+a+' — các ô vừa tô mới chỉ có trên máy bạn',e);
        }
      }
    },600);
  },
  // Thứ tự field khớp 21 cột của genExcel = ĐỒNG BỘ với Google Sheet (bỏ Cổng/Khu vực; Thiết bị lên trước IP đăng ký)
  XLS_FIELDS:['','dai_ly','id','cap_bac','ho_ten','khach','chi_tieu','tien_nap','lan_nap','tien_rut','lan_rut','am_duong','cuoc_hop_le','ngan_hang','chi_nhanh','stk','ip','thiet_bi','link_dk','link_dn','game'],

  loadAgent(){
    const name=document.getElementById('bc-agent-select').value;
    const ib=document.getElementById('bc-info-bar');
    if(!name){document.getElementById('bc-body-detail').innerHTML='<tr><td colspan="20" class="empty">Chọn đại lý để xem chi tiết</td></tr>';ib.style.display='none';return;}
    const rows=BC.ROWS.filter(r=>r.dai_ly===name);
    const info=BC.AGENTS.find(a=>a.dai_ly===name)||{};
    ib.style.display='flex';
    ib.innerHTML=[['Tổng TV',info.tong_thanh_vien],
      ['KH hợp lệ',`<span style="color:#9f67ff;font-weight:bold">${info.khach_hop_le}</span>`],
      ['KH mới',`<span style="color:#3b82f6;font-weight:bold">${info.khach_moi}</span>`],['KH cũ',info.khach_cu],
      ['Tổng nạp',BC.fmt(info.tong_nap)],['Tổng rút',BC.fmt(info.tong_rut)],
      ['Âm/Dương',`<span style="color:${info.am_duong<0?'#16a34a':'#dc2626'};font-weight:bold">${info.am_duong<0?'+'+BC.fmt(Math.abs(info.am_duong)):'-'+BC.fmt(info.am_duong)}</span>`],
      ['Cược HL',BC.fmt(Math.round(info.cuoc_hop_le))]
    ].map(([l,v])=>`<div class="info-item"><div class="lbl">${l}</div><div class="val">${v}</div></div>`).join('');
    const A=(i,f,cls)=>BC.mkAttr(name,i,f,cls);
    document.getElementById('bc-body-detail').innerHTML=rows.map((r,i)=>{
      const tb=r.thiet_bi==='Điện thoại'?'<span class="b-dt">Điện Thoại</span>':'<span class="b-mt">Máy Tính</span>';
      const kh=r.khach==='Mới'?'<span class="b-moi">Mới</span>':'<span class="b-cu">Cũ</span>';
      const ct=r.chi_tieu==='Đạt'?'<span class="b-dat">Đạt</span>':'<span class="b-khong">Không đạt</span>';
      return`<tr><td class="tc stt">${i+1}</td><td ${A(i,'id')}>${hesc(r.id)}</td>
        <td ${A(i,'cap_bac','ell')} title="${hesc(r.cap_bac)}">${hesc(r.cap_bac)}</td><td ${A(i,'ho_ten')}>${hesc(r.ho_ten)}</td>
        <td ${A(i,'khach','tc')}>${kh}</td><td ${A(i,'chi_tieu','tc')}>${ct}</td>
        <td ${A(i,'tien_nap','tc')}>${BC.fmt(r.tien_nap)}</td><td ${A(i,'lan_nap','tc')}>${r.lan_nap}</td>
        <td ${A(i,'tien_rut','tc')}>${BC.fmt(r.tien_rut)}</td><td ${A(i,'lan_rut','tc')}>${r.lan_rut}</td>
        <td ${A(i,'am_duong','tc')}>${BC.ad(r.am_duong)}</td><td ${A(i,'cuoc_hop_le','tc')}>${BC.fmt(r.cuoc_hop_le)}</td>
        <td ${A(i,'ngan_hang')}>${hesc(r.ngan_hang)}</td><td ${A(i,'chi_nhanh')}>${hesc(r.chi_nhanh)}</td><td ${A(i,'stk')}>${hesc(r.stk)}</td>
        <td ${A(i,'ip')} style="font-size:10px">${hesc(r.ip)}</td>
        <td ${A(i,'thiet_bi','tc')}>${tb}</td>
        <td ${A(i,'link_dk','ell')} title="${hesc(r.link_dk)}" style="font-size:10px">${hesc(r.link_dk)}</td>
        <td ${A(i,'link_dn','ell')} title="${hesc(r.link_dn)}" style="font-size:10px">${hesc(r.link_dn)}</td>
        <td ${A(i,'game')} title="${hesc(r.game)}">${hesc(r.game)}</td></tr>`;
    }).join('');
  },

  goAgent(name){const s=document.getElementById('bc-agent-select');s.value=name;const t=document.getElementById('bc-agent-text');if(t){t.value=name;t.style.borderColor='';}BC.loadAgent();BC.showPanel('detail');},

  /* Ô dán tên đại lý ở tab Kiểm Tra: gõ/dán -> khớp đúng tên thì mở luôn; Enter/rời ô thì chấp nhận khớp một phần */
  pickAgentText(el,strict){
    const q=(el.value||'').trim().toLowerCase();
    el.style.borderColor='';
    if(!q){return;}
    const names=BC.AGENTS.map(a=>a.dai_ly);
    let hit=names.find(n=>n.toLowerCase()===q);
    if(!hit&&!strict)hit=names.find(n=>n.toLowerCase().includes(q));
    if(!hit){
      if(!strict){
        el.style.borderColor='#ef4444';
        // Nhân viên: dữ liệu chỉ có đại lý được giao -> nói rõ lý do, đừng để tưởng là lỗi
        if(BC.MY)document.getElementById('bc-body-detail').innerHTML='<tr><td colspan="20" class="empty">Đại lý này không nằm trong danh sách phân công của bạn.</td></tr>';
      }
      return;
    }
    const sel=document.getElementById('bc-agent-select');
    if(sel.value===hit)return;
    sel.value=hit;BC.loadAgent();
  },

  /* KH hợp lệ (nạp ≥ 1.000 & cược ≥ 3.000) thuộc đại lý có ≥ 3 KH hợp lệ = đúng tập mà bản cũ
     giữ lại trong ROWS. Thẻ tổng tính trên tập này để con số báo cáo giữ nguyên nghĩa. */
  qualifiedAgents(){return new Set(BC.AGENTS.filter(a=>a.khach_hop_le>=3).map(a=>a.dai_ly));},
  qualifiedRows(){const q=BC.qualifiedAgents();return BC.ROWS.filter(r=>r.hop_le&&q.has(r.dai_ly));},
  initCards(){
    const Q=BC.qualifiedRows();
    const tn=Q.reduce((s,r)=>s+r.tien_nap,0);
    const tr=Q.reduce((s,r)=>s+r.tien_rut,0);
    const tc=Q.reduce((s,r)=>s+r.cuoc_hop_le,0);
    const moi=Q.filter(r=>r.khach==='Mới').length;
    document.getElementById('bc-summary-cards').innerHTML=`
      <div class="card"><div class="card-label">Đại lý đủ điều kiện</div><div class="card-value">${BC.qualifiedAgents().size}</div></div>
      <div class="card"><div class="card-label">Tổng KH hợp lệ</div><div class="card-value">${Q.length}</div></div>
      <div class="card"><div class="card-label">KH mới (${BC.MAX_MONTH})</div><div class="card-value" style="color:#3b82f6">${moi}</div></div>
      <div class="card"><div class="card-label">KH cũ</div><div class="card-value" style="color:#6b7280">${Q.length-moi}</div></div>
      <div class="card"><div class="card-label">Tổng tiền nạp</div><div class="card-value">${BC.fmt(tn)}</div></div>
      <div class="card"><div class="card-label">Tổng tiền rút</div><div class="card-value">${BC.fmt(tr)}</div></div>
      <div class="card"><div class="card-label">Âm/Dương</div><div class="card-value" style="color:${tn-tr>=0?'#16a34a':'#dc2626'}">${BC.fmt(tn-tr)}</div></div>
      <div class="card"><div class="card-label">Tổng cược HL</div><div class="card-value">${BC.fmt(Math.round(tc))}</div></div>`;
  },

  rebuildAll(){
    /* Nạp lại danh sách nghi ngờ từ cloud để nhãn "Đã Xử Lý" luôn mới, không cần F5 */
    // (nhân viên: RLS chặn đọc Nghi Ngờ — nhãn đã có sẵn trong BC.MY.done, khỏi gọi thừa)
    if(BC.canManage())BC.loadSuspects().then(()=>BC.renderAll()).catch(()=>{});
    BC.initCards();BC.renderAll();BC.renderAgents();BC.renderAssign();
    const sel=document.getElementById('bc-agent-select');
    sel.innerHTML='<option value="">-- Chọn đại lý --</option>';
    BC.AGENTS.forEach(a=>{const o=document.createElement('option');o.value=a.dai_ly;o.textContent=`${a.dai_ly} (${a.khach_hop_le} KH hợp lệ)`;sel.appendChild(o);});
    const dl=document.getElementById('bc-agent-list');
    if(dl)dl.innerHTML=BC.AGENTS.map(a=>`<option value="${hesc(a.dai_ly)}"></option>`).join('');
    const at=document.getElementById('bc-agent-text');
    if(at){at.value='';at.style.borderColor='';}
    document.getElementById('bc-body-detail').innerHTML='<tr><td colspan="20" class="empty">Chọn đại lý để xem chi tiết</td></tr>';
    document.getElementById('bc-info-bar').style.display='none';
  },

  renderPg(id,total,cur,onClick){
    const pages=Math.max(1,Math.ceil(total/BC.PS));
    if(cur>pages)cur=pages;
    /* Ô chọn số dòng mỗi trang (dùng chung BC.PS cho mọi bảng); 0 = tất cả */
    const opts=[100,200,500,1000].map(n=>`<option value="${n}"${n===BC.PS?' selected':''}>${n} dòng/trang</option>`).join('')
      +`<option value="0"${BC.PS>=1e9?' selected':''}>Tất cả</option>`;
    let h=`<select class="pg-sel" onchange="BC.PS=(+this.value||1e9);(${onClick})(1)">${opts}</select>`;
    h+=`<span class="pg-info">Trang ${cur}/${pages}</span>`;
    if(cur>1)h+=`<button class="pg-btn" onclick="(${onClick})(${cur-1})">‹</button>`;
    for(let p=Math.max(1,cur-2);p<=Math.min(pages,cur+2);p++)
      h+=`<button class="pg-btn ${p===cur?'on':''}" onclick="(${onClick})(${p})">${p}</button>`;
    if(cur<pages)h+=`<button class="pg-btn" onclick="(${onClick})(${cur+1})">›</button>`;
    document.getElementById(id).innerHTML=h;
  },

  /* Tab tìm theo data-p (không theo thứ tự) -> chèn thêm tab không làm lệch.
     3 tab quản lý tự rơi về Tổng Hợp nếu không phải ADMIN/Tổ Trưởng. */
  MANAGE_PANELS:['agents','assign','suspect'],
  showPanel(n){
    if(BC.MANAGE_PANELS.includes(n)&&!BC.canManage())n='summary';
    document.querySelectorAll('#t2 .bc-panel').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('#t2 .bc-tab').forEach(t=>t.classList.toggle('active',t.dataset.p===n));
    document.getElementById('bc-panel-'+n).classList.add('active');
    if(n==='suspect')BC.renderSuspects();
    if(n==='assign')BC.assignBoot();
  },
  /* applyPerms gọi: đang đứng ở tab quản lý mà không có quyền thì đẩy về Tổng Hợp */
  fixPanel(){
    const cur=document.querySelector('#t2 .bc-tab.active');
    if(cur&&BC.MANAGE_PANELS.includes(cur.dataset.p)&&!BC.canManage())BC.showPanel('summary');
  },

  /* ================= PHÂN CÔNG CHECK ĐẠI LÝ (17/09/2026) =================
     reports type='bc_assign' month='all' = {list:[{dai_ly,user}], at, by}
     user = TÊN TÀI KHOẢN ĐĂNG NHẬP (profiles.username). Máy chủ (bc_my_view) so khớp
     không phân biệt hoa/thường nên ở đây cũng so như vậy.
     ⚠ Mọi lượt ghi đi qua assignCommit: ĐỌC LẠI bản trên máy chủ rồi mới áp thao tác
       (thêm/xoá) lên bản đó -> 2 Tổ Trưởng sửa cùng lúc không ghi đè mất phần của nhau.
       Không bao giờ ghi thẳng BC.ASSIGN trong máy (có thể đã cũ). */
  ASSIGN:[],
  _accounts:null,          // Map(tên thường -> tên đúng) · null = chưa tải được danh sách tài khoản
  asgKey(a,u){return String(a||'').trim().toLowerCase()+'|'+String(u||'').trim().toLowerCase();},
  async assignBoot(){
    if(!BC.canManage()||!SB.ready()){BC.renderAssign();return;}
    try{
      const d=await SB.loadReport('bc_assign','all');
      BC.ASSIGN=(d&&d.list)||[];
    }catch(e){
      console.error('BC.assignBoot',e);
      BC.assignMsg('Lỗi tải bảng phân công: '+(e.message||e),'err');
    }
    try{
      const{data,error}=await SB.client().from('profiles').select('username');
      if(error)throw error;
      BC._accounts=new Map((data||[]).filter(p=>p.username).map(p=>[p.username.trim().toLowerCase(),p.username.trim()]));
    }catch(e){BC._accounts=null;}
    BC.renderAssign();
  },
  assignMsg(txt,cls){
    const el=document.getElementById('bcaMsg');
    if(!el)return;
    el.className='bca-msg'+(cls?' '+cls:'');el.textContent=txt||'';
  },
  renderAssign(){
    const tb=document.getElementById('bcaBody');
    if(!tb)return;
    const q=((document.getElementById('bcaSearch')||{}).value||'').trim().toLowerCase();
    const agLc=new Set(BC.AGENTS.map(a=>String(a.dai_ly).toLowerCase()));
    const rows=BC.ASSIGN
      .filter(x=>!q||String(x.dai_ly).toLowerCase().includes(q)||String(x.user).toLowerCase().includes(q))
      .slice().sort((a,b)=>String(a.user).localeCompare(String(b.user))||String(a.dai_ly).localeCompare(String(b.dai_ly)));
    const ck=document.getElementById('bcaCkAll');if(ck)ck.checked=false;
    const nv=new Set(BC.ASSIGN.map(x=>String(x.user).toLowerCase())).size;
    document.getElementById('bcaCnt').textContent=BC.ASSIGN.length+' dòng · '+nv+' nhân viên';
    if(!rows.length){
      tb.innerHTML='<tr><td colspan="6" class="empty">'+(BC.ASSIGN.length?'Không có dòng nào khớp.':'Chưa có phân công nào. Dán 2 cột từ Excel vào ô phía trên.')+'</td></tr>';
      return;
    }
    tb.innerHTML=rows.map((x,i)=>{
      const k=hesc(BC.asgKey(x.dai_ly,x.user));
      const coDl=agLc.has(String(x.dai_ly).toLowerCase());
      const coTk=!BC._accounts||BC._accounts.has(String(x.user).trim().toLowerCase());
      const tt=(coDl?'<span class="b-dat">Có dữ liệu</span>':'<span class="b-cu">Không có trong bản hiện tại</span>')
        +(coTk?'':' <span class="b-chua">Không có tài khoản</span>');
      return `<tr><td class="tc"><input type="checkbox" class="bca-ck" data-k="${k}"></td>
        <td class="tc stt">${i+1}</td><td class="tc"><b>${hesc(x.dai_ly)}</b></td>
        <td class="tc">${hesc(x.user)}</td><td class="tc">${tt}</td>
        <td class="tc"><button class="abtn abtn-sm abtn-danger" data-k="${k}" onclick="BC.assignDel(this)">Xóa</button></td></tr>`;
    }).join('');
  },
  assignCheckAll(el){document.querySelectorAll('#bcaBody .bca-ck').forEach(c=>{c.checked=el.checked;});},

  /* Tách văn bản dán từ Excel: mỗi dòng 1 cặp, cột ngăn bằng Tab (Excel) — không có Tab thì
     chấp nhận dấu phẩy / chấm phẩy / | / khoảng trắng. Cột 1 = đại lý, cột 2 = nhân viên;
     nếu danh sách tài khoản cho thấy 2 cột bị đảo (cột 1 mới là tên tài khoản) thì tự đảo lại. */
  assignParse(text){
    const pairs=[],bad=[];
    String(text||'').split(/\r?\n/).forEach((line,i)=>{
      if(!line.trim())return;
      let c=line.split('\t').map(s=>s.trim()).filter(Boolean);
      if(c.length<2)c=line.trim().split(/\s*[,;|]\s*|\s+/).map(s=>s.trim()).filter(Boolean);
      if(c.length<2){bad.push(i+1);return;}
      const a=c[0],u=c[1];
      // bỏ dòng tiêu đề
      if(/đại\s*lý|dai\s*ly|agent/i.test(a+u)&&/nhân\s*viên|nhan\s*vien|tài\s*khoản|tai\s*khoan|user/i.test(a+u))return;
      pairs.push([a,u]);
    });
    let swapped=false;
    if(BC._accounts&&pairs.length){
      const c0=pairs.filter(p=>BC._accounts.has(p[0].toLowerCase())).length;
      const c1=pairs.filter(p=>BC._accounts.has(p[1].toLowerCase())).length;
      if(c0>c1){pairs.forEach(p=>p.reverse());swapped=true;}
    }
    const agName=new Map(BC.AGENTS.map(a=>[String(a.dai_ly).toLowerCase(),a.dai_ly]));
    const out=pairs.map(([a,u])=>({
      dai_ly:agName.get(a.toLowerCase())||a,                                      // chuẩn hoá hoa/thường theo dữ liệu
      user:(BC._accounts&&BC._accounts.get(u.toLowerCase()))||u
    }));
    return{list:out,bad,swapped};
  },

  async assignCommit(op,what,detail){
    if(!BC.canManage()){alert('Chỉ ADMIN và Tổ Trưởng mới sửa được phân công check đại lý.');return false;}
    if(!SB.ready()){alert('Chưa kết nối cloud — không lưu được phân công.');return false;}
    try{
      const d=await SB.loadReport('bc_assign','all');                  // đọc lại bản mới nhất
      const next=op(((d&&d.list)||[]).slice());
      await SB.saveReport('bc_assign','all',{list:next,at:new Date().toISOString(),by:CUR_PROFILE?CUR_PROFILE.username:''});
      BC.ASSIGN=next;
      logAction(what,detail);
      BC.renderAssign();
      return true;
    }catch(e){
      saveFailed('Phân công check đại lý — thay đổi CHƯA được lưu',e);
      return false;
    }
  },

  async assignPaste(){
    const ta=document.getElementById('bcaPaste');
    const{list,bad,swapped}=BC.assignParse(ta.value);
    if(!list.length){BC.assignMsg('Không nhận diện được dòng nào. Mỗi dòng cần 2 cột: Tên đại lý và Tên nhân viên.','err');return;}
    if(BC._accounts){
      const la=[...new Set(list.filter(x=>!BC._accounts.has(x.user.toLowerCase())).map(x=>x.user))];
      if(la.length&&!confirm('CÓ TÊN NHÂN VIÊN KHÔNG KHỚP TÀI KHOẢN NÀO\n\n'+la.slice(0,15).join(', ')+(la.length>15?' …':'')+'\n\nNhân viên không có tài khoản thì không xem được gì. Vẫn thêm?'))return;
    }
    let them=0,trung=0;
    const ok=await BC.assignCommit(cur=>{
      const have=new Set(cur.map(x=>BC.asgKey(x.dai_ly,x.user)));
      list.forEach(x=>{
        const k=BC.asgKey(x.dai_ly,x.user);
        if(have.has(k)){trung++;return;}
        have.add(k);cur.push(x);them++;
      });
      return cur;
    },'Phân công check đại lý (thêm)',list.length+' dòng dán');
    if(!ok)return;
    ta.value='';
    BC.assignMsg('Đã thêm '+them+' dòng · bỏ qua '+trung+' dòng trùng'
      +(bad.length?' · '+bad.length+' dòng lỗi (dòng '+bad.slice(0,10).join(', ')+')':'')
      +(swapped?'\nĐã tự đảo cột (cột 1 là tên nhân viên).':''),'ok');
  },

  async assignDelKeys(keys,label){
    const ks=new Set(keys);
    let xoa=0;
    const ok=await BC.assignCommit(cur=>cur.filter(x=>{
      if(ks.has(BC.asgKey(x.dai_ly,x.user))){xoa++;return false;}
      return true;
    }),'Phân công check đại lý (xóa)',label);
    if(ok)BC.assignMsg('Đã xóa '+xoa+' dòng.','ok');
  },
  assignDel(btn){
    const k=btn.dataset.k,[a,u]=k.split('|');
    if(!confirm('Xóa phân công: đại lý '+a+' — nhân viên '+u+'?'))return;
    BC.assignDelKeys([k],a+' — '+u);
  },
  assignDelSelected(){
    const ks=[...document.querySelectorAll('#bcaBody .bca-ck:checked')].map(c=>c.dataset.k);
    if(!ks.length){alert('Chưa chọn dòng nào.');return;}
    if(!confirm('Xóa '+ks.length+' dòng phân công đã chọn?'))return;
    BC.assignDelKeys(ks,ks.length+' dòng đã chọn');
  },
  assignDelAll(){
    if(!BC.ASSIGN.length){alert('Chưa có phân công nào.');return;}
    if(!confirm('XÓA TOÀN BỘ PHÂN CÔNG\n\n'+BC.ASSIGN.length+' dòng sẽ bị xóa. Mọi nhân viên sẽ không xem được đại lý nào cho tới khi phân công lại.\n\nTiếp tục?'))return;
    BC.assignCommit(()=>[],'Phân công check đại lý (xóa tất cả)',BC.ASSIGN.length+' dòng')
      .then(ok=>{if(ok)BC.assignMsg('Đã xóa toàn bộ phân công.','ok');});
  },

  /* ===== NGHI NGỜ (chỉ ADMIN) — lưu cloud, không mất khi F5 ===== */
  SUSPECTS:[],
  /* Nhân viên không đọc được bản Nghi Ngờ (RLS) -> nhãn "Đã Xử Lý" lấy từ BC.MY.done do máy chủ trả */
  isSuspect(ag){return BC.SUSPECTS.some(x=>x.dai_ly===ag)||!!(BC.MY&&BC.MY.done.has(ag));},
  suspectCount(){return BC.SUSPECTS.filter(x=>!x.sep).length;},
  updateSuspectBadge(){
    const b=document.getElementById('bc-suspect-badge');
    if(b)b.textContent=BC.suspectCount();
  },
  /* Chia danh sách nghi ngờ thành các GIAI ĐOẠN theo phần tử phân cách {sep:true}.
     Mỗi phần tử sep KẾT THÚC 1 giai đoạn. items giữ idx thật trong BC.SUSPECTS. */
  suspectSegments(){
    const segs=[];let cur={items:[],sepIdx:-1};
    BC.SUSPECTS.forEach((s,idx)=>{
      if(s.sep){cur.sepIdx=idx;segs.push(cur);cur={items:[],sepIdx:-1};}
      else cur.items.push({s,idx});
    });
    segs.push(cur);
    const n=segs.length;
    segs.forEach((g,i)=>{g.label=n===1?'Giai Đoạn 1':(i===n-1?'Giai Đoạn Cuối':'Giai Đoạn '+(i+1));});
    return segs;
  },
  hasSuspectSep(){return BC.SUSPECTS.some(x=>x.sep);},
  async loadSuspects(){
    if(!SB.ready())return;
    try{
      const d=await SB.loadReport('suspects','all');
      BC.SUSPECTS=(d&&d.list)||[];
      BC.updateSuspectBadge();
    }catch(e){console.error('loadSuspects',e);}
  },
  async toggleSuspect(ag,cb){
    if(!CUR_PROFILE||!CUR_PROFILE.is_admin){
      alert('Chỉ tài khoản ADMIN mới dùng được chức năng Nghi Ngờ.');
      if(cb)cb.checked=!cb.checked;
      return;
    }
    // Lưu hỏng thì trả danh sách về như cũ: bản trước chỉ trả ô tích, còn BC.SUSPECTS vẫn giữ đại lý vừa đánh
    // dấu ⇒ lần tô ô kế tiếp lưu thành công ghi luôn đại lý đó lên máy chủ. Lịch Sử chỉ ghi SAU khi lưu xong.
    const truoc=BC.SUSPECTS.slice();
    let act,det;
    try{
      if(BC.isSuspect(ag)){
        BC.SUSPECTS=BC.SUSPECTS.filter(x=>x.dai_ly!==ag);
        act='Bỏ nghi ngờ đại lý';det=ag;
      }else{
        const summary=BC.AGENTS.find(a=>a.dai_ly===ag)||null;
        const members=BC.ROWS.filter(r=>r.dai_ly===ag);
        BC.SUSPECTS.push({dai_ly:ag,at:new Date().toISOString(),by:CUR_PROFILE.username,summary,members});
        act='Đánh dấu nghi ngờ đại lý';det=ag+' · '+members.length+' thành viên';
      }
      await SB.saveReport('suspects','all',{list:BC.SUSPECTS});
      logAction(act,det);
      BC.updateSuspectBadge();
      BC.renderAll();
      if(document.getElementById('bc-panel-suspect').classList.contains('active'))BC.renderSuspects();
    }catch(e){
      BC.SUSPECTS=truoc;
      if(cb)cb.checked=!cb.checked;
      saveFailed('Danh sách đại lý nghi ngờ ('+ag+')',e);
    }
  },
  suspectCardHtml(s,idx){
    const t=new Date(s.at).toLocaleString('vi-VN',{timeZone:'Asia/Bangkok',hour12:false});
    const sm=s.summary||{};
    const stats=s.summary
      ?`<span>KH hợp lệ: <b style="color:#9f67ff">${sm.khach_hop_le??'-'}</b></span>
         <span>Tổng nạp: <b>${BC.fmt(sm.tong_nap)}</b></span>
         <span>Tổng rút: <b>${BC.fmt(sm.tong_rut)}</b></span>
         <span>Âm/Dương: ${BC.ad(sm.am_duong||0)}</span>
         <span>KH mới: <b style="color:#3b82f6">${sm.khach_moi??'-'}</b></span>`
      :'<span style="color:var(--mu)">(không có số liệu tổng — đánh dấu lúc chưa tính toán)</span>';
    const visCols=SUSPECT_COLS.filter(c=>SUSPECT_VIS.has(c.k));
    const cm=new Set(s.cellMarks||[]);
    const memRows=(s.members||[]).map((r,i)=>`<tr><td class="tc stt">${i+1}</td>`+
      visCols.map(c=>{
        const on=cm.has(i+'|'+c.k);
        return `<td class="bc-mkc${c.cls?' '+c.cls:''}${on?(c.k==='am_duong'?' bc-mk-ad':' bc-mk'):''}"${c.style?' style="'+c.style+'"':''} onclick="BC.suspectMark(${idx},${i},'${c.k}',this)">${c.cell(r)}</td>`;
      }).join('')+
    `</tr>`).join('');
    const memHead='<th>STT</th>'+visCols.map(c=>`<th>${c.label}</th>`).join('');
    const memColspan=visCols.length+1;
    return`<div style="background:var(--card);border:2px solid var(--bl);border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px">
        <b style="font-size:14px;color:#f87171">${s.dai_ly}</b>
        <span style="font-size:10px;color:var(--mu)">Đánh dấu: ${t} · bởi ${(s.by||'').toUpperCase()}</span>
        <button class="view-btn" onclick="BC.goAgent('${String(s.dai_ly).replace(/'/g,"\\'")}')">Kiểm tra lại</button>
        <button onclick="BC.suspectToggleDetail(${idx})" class="abtn abtn-sm abtn-ghost">Chi tiết KH (${(s.members||[]).length})</button>
        <button onclick="BC.toggleSuspect('${String(s.dai_ly).replace(/'/g,"\\'")}',null)" class="abtn abtn-sm abtn-danger" style="margin-left:auto">Bỏ nghi ngờ</button>
      </div>
      <div style="display:flex;gap:18px;flex-wrap:wrap;font-size:11px;color:var(--mu2)">${stats}</div>
      <div id="bc-suspect-detail-${idx}" style="display:none;margin-top:10px;overflow-x:auto">
        <table><thead><tr>${memHead}</tr></thead>
        <tbody>${memRows||`<tr><td colspan="${memColspan}" class="tc" style="color:var(--mu)">Không có dữ liệu khách</td></tr>`}</tbody></table>
      </div>
    </div>`;
  },
  renderSuspects(){
    const el=document.getElementById('bc-suspect-list');
    if(!el)return;
    const _rl=CUR_PROFILE?roleOf(CUR_PROFILE):null;
    if(!CUR_PROFILE||!(CUR_PROFILE.is_admin||(_rl&&_rl.key==='totruong'))){el.innerHTML='<div class="empty">Chỉ ADMIN / Tổ Trưởng xem được mục này.</div>';return;}
    if(!BC.suspectCount()){el.innerHTML='<div class="empty">Chưa có đại lý nào bị đánh dấu nghi ngờ.</div>';return;}
    // Phân cách giai đoạn: ADMIN + Tổ Trưởng (17/09/2026 — TT dùng đủ chức năng tab Nghi Ngờ)
    const isAdm=BC.canManage();
    const segs=BC.suspectSegments();
    const multi=BC.hasSuspectSep();
    el.innerHTML=segs.map((g,si)=>{
      let h='';
      if(multi)h+=`<div style="display:flex;align-items:center;gap:10px;margin:2px 0 12px;padding:7px 14px;background:linear-gradient(90deg,rgba(124,58,237,.18),transparent);border-left:4px solid var(--pu2);border-radius:6px">
        <b style="font-size:13px;color:var(--pu2)">▶ ${g.label}</b>
        <span style="font-size:11px;color:var(--mu2)">${g.items.length} đại lý</span></div>`;
      h+=g.items.map(({s,idx})=>BC.suspectCardHtml(s,idx)).join('')
        ||`<div class="empty" style="margin-bottom:12px">Giai đoạn này chưa có đại lý.</div>`;
      // Nút xóa phân cách nằm ở ranh giới KẾT THÚC giai đoạn (trừ giai đoạn cuối)
      if(g.sepIdx>=0)h+=`<div style="display:flex;align-items:center;gap:10px;margin:0 0 16px">
        <div style="flex:1;height:2px;background:repeating-linear-gradient(90deg,var(--go) 0 10px,transparent 10px 18px)"></div>
        <span style="font-size:10px;color:var(--go);font-weight:700;white-space:nowrap">— PHÂN CÁCH GIAI ĐOẠN —</span>
        ${isAdm?`<button onclick="BC.removeSuspectSep(${g.sepIdx})" title="Xóa phân cách này (gộp lại với giai đoạn sau)" class="abtn abtn-sm abtn-danger" style="white-space:nowrap">✕ Xóa phân cách</button>`:''}
        <div style="flex:1;height:2px;background:repeating-linear-gradient(90deg,var(--go) 0 10px,transparent 10px 18px)"></div>
      </div>`;
      return h;
    }).join('');
  },
  async addSuspectSep(){
    if(!CUR_PROFILE||!BC.canManage()){alert('Chỉ ADMIN và Tổ Trưởng mới chèn được phân cách giai đoạn.');return;}
    if(!BC.suspectCount()){alert('Chưa có đại lý nghi ngờ nào — hãy đánh dấu đại lý trước khi phân cách giai đoạn.');return;}
    if(BC.SUSPECTS.length&&BC.SUSPECTS[BC.SUSPECTS.length-1].sep){alert('Phần cuối danh sách đã là một phân cách — hãy thêm đại lý cho giai đoạn mới trước khi phân cách tiếp.');return;}
    try{
      BC.SUSPECTS.push({sep:true,at:new Date().toISOString(),by:CUR_PROFILE.username});
      await SB.saveReport('suspects','all',{list:BC.SUSPECTS});
      logAction('Chèn phân cách giai đoạn nghi ngờ','Sau '+BC.suspectCount()+' đại lý');
      BC.renderSuspects();
    }catch(e){saveFailed('Phân cách giai đoạn nghi ngờ',e);BC.SUSPECTS=BC.SUSPECTS.filter((x,i)=>i!==BC.SUSPECTS.length-1);}
  },
  async removeSuspectSep(idx){
    if(!CUR_PROFILE||!BC.canManage()){alert('Chỉ ADMIN và Tổ Trưởng mới xóa được phân cách giai đoạn.');return;}
    const s=BC.SUSPECTS[idx];
    if(!s||!s.sep)return;
    try{
      BC.SUSPECTS.splice(idx,1);
      await SB.saveReport('suspects','all',{list:BC.SUSPECTS});
      logAction('Xóa phân cách giai đoạn nghi ngờ','');
      BC.renderSuspects();
    }catch(e){saveFailed('Xoá phân cách giai đoạn nghi ngờ',e);BC.loadSuspects().then(()=>BC.renderSuspects());}
  },
  suspectToggleDetail(idx){
    const el=document.getElementById('bc-suspect-detail-'+idx);
    if(el)el.style.display=el.style.display==='none'?'block':'none';
  },

  /* Tô ô nghi ngờ trong thẻ Nghi Ngờ — LƯU CLOUD (s.cellMarks = ["rowIdx|field",...]) */
  async suspectMark(idx,i,f,td){
    const s=BC.SUSPECTS[idx];
    if(!s)return;
    if(CUR_PROFILE&&!canEdit('bc')){alert('Bạn chỉ có quyền XEM, không tô được điểm nghi ngờ.');return;}
    const truoc=s.cellMarks,cm=new Set(s.cellMarks||[]),k=i+'|'+f;
    const cls=f==='am_duong'?'bc-mk-ad':'bc-mk',bo=cm.has(k);
    if(bo){cm.delete(k);td.classList.remove('bc-mk','bc-mk-ad');}
    else{cm.add(k);td.classList.add(cls);}
    s.cellMarks=[...cm];
    try{await SB.saveReport('suspects','all',{list:BC.SUSPECTS});}
    catch(e){
      // trả ô về như cũ — không thì ô vẫn tô trên màn hình mà máy chủ không có
      s.cellMarks=truoc;
      if(bo)td.classList.add(cls);else td.classList.remove('bc-mk','bc-mk-ad');
      saveFailed('Tô ô nghi ngờ ('+(s.dai_ly||'')+')',e);
    }
  },

  /* ---- Gửi danh sách Nghi Ngờ sang Google Sheet (Apps Script Web App — file google_sheet_baocao.gs)
     Chỉ Tổ Trưởng trở lên. Giữ nguyên form 23 cột như file Excel Telegram:
     nền vàng, cột Đại lý cam, ô tô = cam đậm, riêng Âm/Dương tô = đỏ nhạt ---- */
  GS_WEBAPP_URL:'https://script.google.com/macros/s/AKfycbyH_ZdOK0YE8QUzBjWeg_NgnbuY6kOMtuUJZD8yGbpQaCCDKxaPT4lr9712tmKx9jZGFQ/exec',
  GS_TOKEN:'sanji-bc-2026',
  /* Bấm nút "Báo Cáo ⇢ Google Sheet": nếu có phân cách giai đoạn thì mở menu chọn giai đoạn,
     không thì gửi thẳng toàn bộ (như cũ). */
  clickSheetBtn(){
    const rl=CUR_PROFILE?roleOf(CUR_PROFILE):null;
    if(!CUR_PROFILE||!(CUR_PROFILE.is_admin||(rl&&rl.key==='totruong'))){alert('Chức năng này chỉ dành cho Tổ Trưởng trở lên.');return;}
    if(!BC.suspectCount()){alert('Chưa có đại lý nghi ngờ nào để gửi.');return;}
    const menu=document.getElementById('bcSusPhaseMenu');
    if(!BC.hasSuspectSep()){if(menu)menu.style.display='none';BC.sendSuspectsToSheet('all');return;}
    if(!menu)return;
    if(menu.style.display==='block'){menu.style.display='none';return;}
    const segs=BC.suspectSegments();
    const btnCss='display:block;width:100%;text-align:left;margin:0 0 4px;padding:7px 12px;background:var(--card2);border:1px solid var(--border2);border-radius:6px;color:var(--tx);font-size:12px;font-weight:700;cursor:pointer';
    let h=`<div style="font-size:10px;color:var(--mu);padding:2px 4px 6px">Chọn giai đoạn để gửi:</div>`;
    segs.forEach((g,si)=>{if(!g.items.length)return;
      h+=`<button style="${btnCss}" onclick="BC.sendSuspectsToSheet(${si})">${g.label} <span style="color:var(--mu2);font-weight:600">(${g.items.length} đại lý)</span></button>`;});
    h+=`<button style="${btnCss}border-color:var(--pu2);color:var(--pu2)" onclick="BC.sendSuspectsToSheet('all')">Tất cả giai đoạn <span style="color:var(--mu2);font-weight:600">(${BC.suspectCount()} đại lý)</span></button>`;
    menu.innerHTML=h;menu.style.display='block';
    setTimeout(()=>{const close=e=>{if(!menu.contains(e.target)&&e.target.id!=='bcSusSheetBtn'){menu.style.display='none';document.removeEventListener('mousedown',close);}};document.addEventListener('mousedown',close);},0);
  },
  async sendSuspectsToSheet(phase){
    const rl=CUR_PROFILE?roleOf(CUR_PROFILE):null;
    if(!CUR_PROFILE||!(CUR_PROFILE.is_admin||(rl&&rl.key==='totruong'))){alert('Chức năng này chỉ dành cho Tổ Trưởng trở lên.');return;}
    if(!BC.GS_WEBAPP_URL){alert('Chưa cấu hình Google Sheet.\n\nCần deploy file google_sheet_baocao.gs (Apps Script) rồi dán URL Web App vào BC.GS_WEBAPP_URL trong dashboard_v2.html.');return;}
    const menu=document.getElementById('bcSusPhaseMenu');if(menu)menu.style.display='none';
    // Chọn danh sách đại lý theo giai đoạn
    let list,phaseLabel;
    if(phase==='all'||phase==null){list=BC.SUSPECTS.filter(x=>!x.sep);phaseLabel='tất cả giai đoạn';}
    else{const g=BC.suspectSegments()[phase];if(!g||!g.items.length){alert('Giai đoạn này chưa có đại lý.');return;}list=g.items.map(x=>x.s);phaseLabel=g.label;}
    if(!list.length){alert('Chưa có đại lý nghi ngờ nào để gửi.');return;}
    if(!confirm('Gửi '+list.length+' đại lý nghi ngờ ('+phaseLabel+', kèm màu tô) sang Google Sheet "Báo cáo đại lý ngoài"?'))return;
    // Mỗi đại lý 1 khối riêng (server chừa 1 dòng trống + merge cột Đại lý);
    // server tự khớp field theo TIÊU ĐỀ HÀNG 1 của sheet. Tiền định dạng sẵn kiểu VN (350.000)
    const blocks=list.map(s=>{
      const cm=new Set(s.cellMarks||[]);
      return{agent:s.dai_ly,rows:(s.members||[]).map((r,i)=>({
        v:{id:r.id,cap_bac:r.cap_bac,ho_ten:r.ho_ten,khach:r.khach,chi_tieu:r.chi_tieu,
           tien_nap:BC.fmt(r.tien_nap),lan_nap:r.lan_nap,tien_rut:BC.fmt(r.tien_rut),lan_rut:r.lan_rut,
           am_duong:BC.fmt(r.am_duong),cuoc_hop_le:BC.fmt(r.cuoc_hop_le),
           ngan_hang:r.ngan_hang,chi_nhanh:r.chi_nhanh,stk:String(r.stk??''),ip:r.ip,
           thiet_bi:r.thiet_bi==='Điện thoại'?'Điện Thoại':'Máy Tính',link_dk:r.link_dk,link_dn:r.link_dn,game:r.game},
        mk:[...cm].filter(k=>k.indexOf(i+'|')===0).map(k=>k.slice(String(i).length+1))
      }))};
    });
    const rowTotal=blocks.reduce((s,b)=>s+b.rows.length,0);
    const btn=document.getElementById('bcSusSheetBtn');
    const old=btn?btn.textContent:'';
    if(btn){btn.disabled=true;btn.textContent='Đang gửi Google Sheet...';}
    try{
      // Content-Type text/plain: tránh CORS preflight (Apps Script không trả lời OPTIONS)
      const res=await fetch(BC.GS_WEBAPP_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify({token:BC.GS_TOKEN,by:(CUR_PROFILE.username||'').toUpperCase(),blocks})});
      const j=await res.json().catch(()=>null);
      if(j&&j.ok){
        alert('Đã dán '+(j.added||rowTotal)+' dòng ('+list.length+' đại lý · '+phaseLabel+') vào Google Sheet ✓');
        logAction('Gửi nghi ngờ → Google Sheet',list.length+' đại lý · '+phaseLabel+' · '+rowTotal+' dòng');
      }else{
        alert('Gửi không thành công'+(j&&j.error?':\n'+j.error:' — kiểm tra lại deploy Apps Script (Web app · Anyone).'));
      }
    }catch(e){alert('Lỗi kết nối Google Sheet: '+e.message);}
    if(btn){btn.disabled=false;btn.textContent=old;}
  },

  showOverlay(msg){document.getElementById('bc-overlay').classList.add('show');BC.overlayMsg(msg);},
  hideOverlay(){document.getElementById('bc-overlay').classList.remove('show');},
  overlayMsg(m){document.getElementById('bc-overlay-msg').textContent=m;},

  exportCSV(type){
    const H=['ĐL','Tên tài khoản','Cấp bậc','Họ tên đăng kí','Khách','Chỉ tiêu','Tiền nạp','Lần nạp','Tiền rút','Lần rút','Âm/Dương','Cược hợp lệ','Ngân hàng','Chi nhánh','STK','IP','Thiết bị','LINK đăng ký','LINK đăng nhập','Cược sảnh'];
    const toRow=r=>[r.dai_ly,r.id,r.cap_bac,r.ho_ten,r.khach,r.chi_tieu,r.tien_nap,r.lan_nap,r.tien_rut,r.lan_rut,r.am_duong,r.cuoc_hop_le,r.ngan_hang,r.chi_nhanh,r.stk,r.ip,r.thiet_bi,r.link_dk,r.link_dn,r.game];
    let headers,data,filename;
    if(type==='agents'){
      headers=['Đại lý','Tổng TV','KH hợp lệ','KH mới','KH cũ','Tổng nạp','Tổng rút','Âm/Dương','Cược HL'];
      data=BC.filtAgents.map(a=>[a.dai_ly,a.tong_thanh_vien,a.khach_hop_le,a.khach_moi,a.khach_cu,a.tong_nap,a.tong_rut,a.am_duong,a.cuoc_hop_le]);
      filename='danh_sach_dai_ly.csv';
    }else if(type==='detail'){
      const name=document.getElementById('bc-agent-select').value;
      if(!name){alert('Vui lòng chọn đại lý!');return;}
      headers=H;data=BC.ROWS.filter(r=>r.dai_ly===name).map(toRow);filename=`dai_ly_${name}.csv`;
    }else{
      headers=H;data=BC.filtAll.map(toRow);filename='tong_hop_thanh_vien.csv';
    }
    const csv='﻿'+[headers,...data].map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    a.download=filename;a.click();
  },

  // ---- Báo cáo đại lý bất thường ----
  _selFk: null,

  // Render chip nhân viên phụ trách TỪ ROSTER (động): bất thường = nhóm VIP; cược = tất cả nhân viên active.
  renderFkChips(){
    const bt=document.getElementById('bcBtChips');
    if(bt)bt.innerHTML=FKVIP.map(fk=>`<div class="bc-bt-chip" onclick="BC.selectFk('${FK_NAMES[fk]}')">${FK_NAMES[fk]}</div>`).join('');
    const cu=document.getElementById('bcCuChips');
    if(cu)cu.innerHTML=FK_KEYS.map(fk=>`<div class="bc-cu-chip" onclick="BC.selectCuFk('${FK_NAMES[fk]}')">${FK_NAMES[fk]}</div>`).join('');
  },

  openBtModal(){
    if(CUR_PROFILE&&!canEdit('bc')){alert('Bạn chỉ có quyền XEM, không được gửi báo cáo.');return;}
    const name=document.getElementById('bc-agent-select').value;
    if(!name){alert('Vui lòng chọn đại lý trước!');return;}
    const ag=BC.AGENTS.find(a=>a.dai_ly===name);
    document.getElementById('bc-bt-agent-info').innerHTML=
      `<b>Đại lý: ${name}</b> &nbsp;·&nbsp; KH hợp lệ: ${ag?ag.khach_hop_le:0} &nbsp;·&nbsp; Tổng thành viên: ${ag?ag.tong_thanh_vien:0}`;
    BC._selFk=null;
    BC.renderFkChips();
    document.querySelectorAll('.bc-bt-chip').forEach(c=>c.classList.remove('sel'));
    document.getElementById('bc-bt-content').value='';
    document.getElementById('bc-bt-status').textContent='';
    document.getElementById('bc-bt-send-btn').disabled=false;
    document.getElementById('bc-bt-modal').style.display='flex';
  },

  closeBtModal(){document.getElementById('bc-bt-modal').style.display='none';},

  selectFk(fk){
    BC._selFk=fk;
    document.querySelectorAll('.bc-bt-chip').forEach(c=>c.classList.toggle('sel',c.textContent===fk));
  },

  // TÊN hiển thị -> key roster. BẮT BUỘC dùng khi gửi báo cáo: server cộng điểm thẳng vào mã này,
  // nên nếu ghép 'fk'+tên thì đổi tên nhân viên là điểm rơi vào mã lạ, không ai hiển thị (vụ CHAMY→SOLIS 05/08/2026).
  _fkKey(name){
    return NAME2FK[String(name||'').toUpperCase()]||('fk'+String(name||'').toLowerCase().replace(/[^a-z0-9]/g,''));
  },

  // Gửi báo cáo QUA EDGE FUNCTION — token bot nằm bí mật ở server, điểm cộng do server quyết định
  async callSendReport(mode,fk,content,agent,files){
    if(!SB.ready())throw new Error('Chưa cấu hình cloud');
    const{data:sess}=await SB.client().auth.getSession();
    const token=sess&&sess.session&&sess.session.access_token;
    if(!token)throw new Error('Chưa đăng nhập');
    const fd=new FormData();
    fd.append('meta',JSON.stringify({mode,fk,content,agent}));
    (files||[]).forEach((f,i)=>fd.append('file'+i,f,f.name||('file_'+i)));
    const r=await fetch(SB_URL+'/functions/v1/super-function',{method:'POST',headers:{'Authorization':'Bearer '+token,'apikey':SB_KEY},body:fd});
    return await r.json();
  },

  async sendBatThuong(){
    if(!BC._selFk){alert('Vui lòng chọn nhân viên phụ trách (FK)!');return;}
    const agentName=document.getElementById('bc-agent-select').value;
    const content=document.getElementById('bc-bt-content').value.trim();
    const rows=BC.ROWS.filter(r=>r.dai_ly===agentName);
    const status=document.getElementById('bc-bt-status');
    const btn=document.getElementById('bc-bt-send-btn');
    btn.disabled=true;
    status.style.color='#888';status.textContent='Đang tạo file Excel...';
    try{
      const blob=BC.genExcel(rows,agentName,BC.mkSet(agentName));
      const d=new Date();
      const dd=d.getDate().toString().padStart(2,'0'),mm=(d.getMonth()+1).toString().padStart(2,'0');
      const file=new File([blob],`BaoCao_${agentName}_${BC._selFk}_${dd}${mm}.xls`,{type:'application/vnd.ms-excel'});
      status.textContent='Đang gửi Telegram...';
      const res=await BC.callSendReport('dai_ly',BC._fkKey(BC._selFk),content,agentName,[file]);
      if(res.ok){
        status.style.color='#22c55e';status.textContent='Gửi thành công!';
        setTimeout(()=>BC.closeBtModal(),1600);
      }else{
        status.style.color='#ef4444';status.textContent='Lỗi: '+(res.description||'Unknown');
        btn.disabled=false;
      }
    }catch(err){
      status.style.color='#ef4444';status.textContent='Lỗi kết nối: '+err.message;
      btn.disabled=false;
    }
  },

  // Cấp bậc "đối đầu" (đồng bộ isDoiDau_ của google_sheet_baocao.gs): tự động tô đỏ nhạt
  _isDoiDau(v){const s=String(v??'').toLowerCase().replace(/\s+/g,' ').trim();return s.indexOf('đổi đầu')>-1||s.indexOf('đối đầu')>-1||s.indexOf('doi dau')>-1||/\[?dd-/.test(s);},

  genExcel(rows,agentName,marks){
    /* SpreadsheetML XML — ĐỒNG BỘ 100% với báo cáo Google Sheet (google_sheet_baocao.gs):
       21 cột (bỏ Cổng/Khu vực), Tahoma 9 đậm, tiền định dạng VN, ô trống "-", Ngân hàng trống "USDT",
       tiêu đề cam nhạt #F8CBAD, ô Đại lý cam đậm #F4B084 (merge cả khối), tô nghi ngờ vàng đậm #FFE599,
       Âm/Dương nghi ngờ + Cấp bậc ĐỔI ĐẦU đỏ nhạt #FFC7CE. Viền ngoài khối đậm (medium). */
    const HDRS=['STT','Đại lý','Tên tài khoản','Cấp bậc','Họ tên đăng kí','Khách','Chỉ tiêu','Tổng nạp','Lần nạp','Tổng rút','Lần rút','Âm/Dương','Cược hợp lệ','Ngân hàng','Chi nhánh','STK','IP','Thiết bị','IP đăng ký','IP đăng nhập','Sảnh'];
    const CW=[28,60,80,165,125,40,50,70,50,70,50,70,72,75,75,100,82,60,120,120,120];
    const F=BC.XLS_FIELDS; // 21 field khớp HDRS ('' = cột STT / Đại lý)
    const MONEY={tien_nap:1,tien_rut:1,am_duong:1,cuoc_hop_le:1};
    const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const B='<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>';
    // Viền ngoài khối đậm: cạnh trái/phải luôn dày; trên chỉ dòng đầu, dưới chỉ dòng cuối
    const BX=(top,bot)=>`<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="${bot?2:1}"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="${top?2:1}"/>`;
    const FONT='<Font ss:Bold="1" ss:Name="Tahoma" ss:Size="9" ss:Color="#000000"/>';
    // Style theo màu nền + trạng thái viền (t=top đậm, b=bottom đậm)
    const STY={};
    let stylesXml='';
    const style=(bg,t,b)=>{
      const id=`s_${bg.slice(1)}_${t?1:0}${b?1:0}`;
      if(!STY[id]){STY[id]=1;stylesXml+=`<Style ss:ID="${id}"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Borders>${BX(t,b)}</Borders>${FONT}<Interior ss:Color="${bg}" ss:Pattern="Solid"/></Style>`;}
      return id;
    };
    const c=(v,sty,forceStr)=>{
      const num=!forceStr&&v!==''&&v!==null&&v!==undefined&&String(v).trim()!==''&&!isNaN(Number(v));
      return`<Cell ss:StyleID="${sty}"><Data ss:Type="${num?'Number':'String'}">${esc(num?v:String(v??''))}</Data></Cell>`;
    };
    const n=rows.length;
    // Body: tính XML trước để gom style động, header style tính sau
    let body='';
    rows.forEach((r,i)=>{
      const top=i===0,bot=i===n-1;
      let row='';
      F.forEach((f,ci)=>{
        // Cột Đại lý: merge dọc cả khối → chỉ vẽ ô ở dòng đầu, các dòng sau bỏ ô (dùng ss:Index cho ô kế)
        if(ci===1){
          if(top){
            const sty=style('#F4B084',true,bot);
            row+=`<Cell ss:StyleID="${sty}"${n>1?` ss:MergeDown="${n-1}"`:''}><Data ss:Type="String">${esc(agentName)}</Data></Cell>`;
          }
          return; // dòng >0: bỏ ô (đã bị merge)
        }
        // Giá trị hiển thị
        let val,forceStr=false;
        if(ci===0){val=i+1;} // STT
        else if(MONEY[f]){val=BC.fmt(r[f]);if(val==='')val='-';forceStr=true;}
        else{
          val=r[f];
          if(val===''||val===null||val===undefined||String(val).trim()===''){val=f==='ngan_hang'?'USDT':'-';}
          forceStr=(f==='stk');
        }
        // Màu nền
        let bg='#FFF2CC';
        if(marks&&f&&marks.has(i+'|'+f))bg=f==='am_duong'?'#FFC7CE':'#FFE599';
        if(f==='cap_bac'&&BC._isDoiDau(r.cap_bac))bg='#FFC7CE';
        const sty=style(bg,top,bot);
        // Dòng >0 & là ô đầu tiên sau cột Đại lý (ci===2): cần ss:Index=3 vì ô Đại lý bị merge bỏ
        const idx=(!top&&ci===2)?' ss:Index="3"':'';
        row+=`<Cell ss:StyleID="${sty}"${idx}><Data ss:Type="${(!forceStr&&val!==''&&!isNaN(Number(val))&&String(val).trim()!=='')?'Number':'String'}">${esc(val)}</Data></Cell>`;
      });
      body+=`<Row>${row}</Row>`;
    });
    const hSty=style('#F8CBAD',true,false); // tiêu đề: cam nhạt, viền trên đậm
    let x=`<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>${stylesXml}</Styles>
<Worksheet ss:Name="Báo cáo"><Table>
${CW.map(w=>`<Column ss:Width="${w}"/>`).join('')}
<Row ss:AutoFitHeight="1">${HDRS.map(h=>c(h,hSty,true)).join('')}</Row>${body}`;
    x+=`</Table></Worksheet></Workbook>`;
    return new Blob(['﻿'+x],{type:'application/vnd.ms-excel;charset=utf-8'});
  },

  // ---- Báo cáo cược bất thường ----
  _selCuFk:null, _cuFiles:[], _cuPaste:null,

  /* Hỗ trợ NHIỀU file/ảnh cùng lúc: chọn, kéo thả, dán nhiều lần đều gom vào danh sách */
  _cuAddFile(f){
    if(!f)return;
    BC._cuFiles.push(f);
    BC._cuRenderFiles();
  },
  _cuRemoveFile(i){
    BC._cuFiles.splice(i,1);
    BC._cuRenderFiles();
  },
  _cuRenderFiles(){
    const dz=document.getElementById('bc-cu-drop');
    const nm=document.getElementById('bc-cu-fname');
    const icon=dz.querySelector('.bc-cu-dz-icon');
    const main=dz.querySelector('.bc-cu-dz-main');
    const sub=dz.querySelector('.bc-cu-dz-sub');
    if(!BC._cuFiles.length){
      nm.innerHTML='';
      dz.classList.remove('bc-cu-has-file');
      if(icon){icon.style.display='';icon.textContent='↑';}
      if(main){main.style.display='';main.textContent='Kéo thả file / hình ảnh vào đây';}
      if(sub)sub.style.display='';
      return;
    }
    dz.classList.add('bc-cu-has-file');
    if(icon)icon.style.display='none';
    if(main)main.textContent='Đã chọn '+BC._cuFiles.length+' file (thêm tiếp được)';
    if(sub)sub.style.display='none';
    nm.innerHTML=BC._cuFiles.map((f,i)=>{
      const size=f.size>1024*1024?(f.size/1024/1024).toFixed(1)+' MB':(f.size/1024).toFixed(0)+' KB';
      return `<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:3px"><span>${(f.name||'paste.png')} (${size})</span><b style="color:#ef4444;cursor:pointer" onclick="event.preventDefault();event.stopPropagation();BC._cuRemoveFile(${i})">✕</b></div>`;
    }).join('');
  },

  openCuModal(){
    if(CUR_PROFILE&&!canEdit('bc')){alert('Bạn chỉ có quyền XEM, không được gửi báo cáo.');return;}
    BC._selCuFk=null;BC._cuFiles=[];
    BC.renderFkChips();
    document.querySelectorAll('.bc-cu-chip').forEach(c=>c.classList.remove('sel'));
    document.getElementById('bc-cu-content').value='';
    document.getElementById('bc-cu-file').value='';
    document.getElementById('bc-cu-fname').innerHTML='';
    const _dz=document.getElementById('bc-cu-drop');
    _dz.classList.remove('bc-cu-has-file');
    const _dzIcon=_dz.querySelector('.bc-cu-dz-icon');
    const _dzMain=_dz.querySelector('.bc-cu-dz-main');
    const _dzSub=_dz.querySelector('.bc-cu-dz-sub');
    if(_dzIcon){_dzIcon.style.display='';_dzIcon.textContent='↑';}
    if(_dzMain){_dzMain.style.display='';_dzMain.textContent='Kéo thả file / hình ảnh vào đây';}
    if(_dzSub)_dzSub.style.display='';
    document.getElementById('bc-cu-status').textContent='';
    document.getElementById('bc-cu-send-btn').disabled=false;
    document.getElementById('bc-cu-modal').style.display='flex';
    /* paste listener — capture phase so we intercept before textarea */
    if(BC._cuPaste){document.removeEventListener('paste',BC._cuPaste,true);BC._cuPaste=null;}
    BC._cuPaste=function(e){
      const items=(e.clipboardData||window.clipboardData)?.items;
      if(!items)return;
      for(const it of [...items]){
        if(it.type.startsWith('image/')){
          const f=it.getAsFile();
          if(f){
            BC._cuAddFile(new File([f],`paste_${Date.now()}.png`,{type:f.type}));
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        }
      }
    };
    document.addEventListener('paste',BC._cuPaste,true);
  },

  closeCuModal(){
    document.getElementById('bc-cu-modal').style.display='none';
    if(BC._cuPaste){document.removeEventListener('paste',BC._cuPaste,true);BC._cuPaste=null;}
  },

  selectCuFk(fk){
    BC._selCuFk=fk;
    document.querySelectorAll('.bc-cu-chip').forEach(c=>c.classList.toggle('sel',c.textContent===fk));
  },

  onCuFile(inp){Array.from(inp.files||[]).forEach(f=>BC._cuAddFile(f));inp.value='';},

  onCuDrag(e,on){e.preventDefault();document.getElementById('bc-cu-drop').classList.toggle('drag',on);},

  onCuDrop(e){
    e.preventDefault();
    document.getElementById('bc-cu-drop').classList.remove('drag');
    Array.from(e.dataTransfer?.files||[]).forEach(f=>BC._cuAddFile(f));
  },

  async sendCuocBatThuong(){
    if(!BC._selCuFk){alert('Vui lòng chọn nhân viên phụ trách (FK)!');return;}
    const content=document.getElementById('bc-cu-content').value.trim();
    const files=BC._cuFiles.slice();
    const status=document.getElementById('bc-cu-status');
    const btn=document.getElementById('bc-cu-send-btn');
    btn.disabled=true;
    status.style.color='#888';status.textContent='Đang gửi...';
    try{
      const res=await BC.callSendReport('cuoc',BC._fkKey(BC._selCuFk),content,'',files);
      if(res.ok){
        status.style.color='#22c55e';status.textContent='Đã gửi thành công!';
        setTimeout(()=>BC.closeCuModal(),1800);
      }else{
        status.style.color='#ef4444';status.textContent='Lỗi: '+(res.description||'Unknown');
        btn.disabled=false;
      }
    }catch(err){
      status.style.color='#ef4444';status.textContent='Lỗi: '+err.message;
      btn.disabled=false;
    }
  }
};

/* ⚠ `const BC` nằm ở scope LEXICAL toàn cục, KHÔNG có trên window (đúng cái bẫy đã vấp
   với AUTH ở ô nhập OTP). switchRp chạy được trước khi BC khởi tạo xong nên phải dò
   qua window.BC — không phơi ra đây thì BC.boot() im lặng không bao giờ chạy. */
window.BC=BC;

renderRpTabs();   // phải chạy TRƯỚC applyPerms (nó ẩn .rp-tab[data-v="bc"] theo selector)
BC.rebuildAll();
AUTH.init();