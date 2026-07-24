
// ===== TOOL SWITCHER =====
function switchTool(id){
  document.getElementById('t1').style.display=id==='t1'?'':'none';
  document.getElementById('t2').style.display=id==='t2'?'':'none';
  document.getElementById('tsb1').classList.toggle('on',id==='t1');
  document.getElementById('tsb2').classList.toggle('on',id==='t2');
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

  async processFiles(){
    if(CUR_PROFILE&&!canEdit('bc')){alert('Bạn chỉ có quyền XEM báo cáo đại lý, không được tính toán dữ liệu mới.');return;}
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
        let regDate=null;
        const dval=row['Thời gian gửi tiền thực tế đầu tiên'];
        if(dval instanceof Date)regDate=dval;
        else if(typeof dval==='number')regDate=new Date(Math.round((dval-25569)*86400*1000));
        else if(typeof dval==='string'&&dval)regDate=new Date(dval);
        infoMap[u]={ho_ten:row['tên thật']||'',ip:row['IP đăng nhập lần cuối']||'',
          link_dk:row['Đăng ký URL nguồn']||'',link_dn:linkDn,
          ngan_hang:row['Ngân hàng_1']||'',chi_nhanh:row['Ngân hàng_1 - Quận']||'',
          stk:String(row['Ngân hàng_1 - Tài khoản']||''),thiet_bi,regDate};
      });

      let maxTs=0;
      Object.values(infoMap).forEach(m=>{if(m.regDate&&m.regDate.getTime()>maxTs)maxTs=m.regDate.getTime();});
      const maxDate=maxTs?new Date(maxTs):new Date();
      const maxM=maxDate.getFullYear()+'-'+(String(maxDate.getMonth()+1).padStart(2,'0'));
      BC.log(`  📅 Tháng hiện tại: ${maxM}`);

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
        m.chi_tieu=m.hop_le?'Đạt':'Chưa đạt';
        const info=infoMap[m.id]||{};
        Object.assign(m,{ho_ten:info.ho_ten||'',ip:info.ip||'',link_dk:info.link_dk||'',
          link_dn:info.link_dn||'',ngan_hang:info.ngan_hang||'',chi_nhanh:info.chi_nhanh||'',
          stk:info.stk||'',thiet_bi:info.thiet_bi||'Máy tính'});
        const rd=info.regDate;
        m.khach=rd&&(rd.getFullYear()+'-'+String(rd.getMonth()+1).padStart(2,'0'))===maxM?'Mới':'Cũ';
        m.game=gameTop2[m.dai_ly+'|||'+m.id]||'';
      });

      const agentValid={};
      members.forEach(m=>{if(!agentValid[m.dai_ly])agentValid[m.dai_ly]=0;if(m.hop_le)agentValid[m.dai_ly]++;});
      const qualified=new Set(Object.keys(agentValid).filter(a=>agentValid[a]>=3));
      BC.log(`  ✅ Đại lý đủ điều kiện: ${qualified.size}`);

      BC.ROWS=members.filter(m=>m.hop_le&&qualified.has(m.dai_ly))
        .sort((a,b)=>a.dai_ly.localeCompare(b.dai_ly)||b.tien_nap-a.tien_nap);

      const agSum={};
      members.filter(m=>qualified.has(m.dai_ly)).forEach(m=>{
        if(!agSum[m.dai_ly])agSum[m.dai_ly]={dai_ly:m.dai_ly,tong_thanh_vien:0,khach_hop_le:0,tong_nap:0,tong_rut:0,am_duong:0,cuoc_hop_le:0,khach_moi:0,khach_cu:0};
        const a=agSum[m.dai_ly];a.tong_thanh_vien++;
        if(m.hop_le)a.khach_hop_le++;
        a.tong_nap+=m.tien_nap;a.tong_rut+=m.tien_rut;a.am_duong+=m.am_duong;a.cuoc_hop_le+=m.cuoc_hop_le;
        if(m.khach==='Mới')a.khach_moi++;else a.khach_cu++;
      });
      BC.AGENTS=Object.values(agSum).sort((a,b)=>a.dai_ly.localeCompare(b.dai_ly));
      BC.MAX_MONTH=maxM;BC.setProgress(90);

      BC.filtAll=[...BC.ROWS];BC.filtAgents=[...BC.AGENTS];BC.pgAll=1;BC.pgAgents=1;
      BC.log(`  📊 Tổng KH hợp lệ: ${BC.ROWS.length}`);BC.log('✅ Xong!');BC.setProgress(100);
      const badge=document.getElementById('bc-ds-badge');
      badge.textContent='MỚI';badge.style.background='#22c55e';badge.style.color='white';
      BC.hideOverlay();BC.rebuildAll();
      /* Báo cáo đại lý chỉ giữ trên máy (không lưu cloud) — F5 là dữ liệu về mặc định */
    }catch(err){BC.hideOverlay();BC.log('❌ Lỗi: '+err.message);console.error(err);}
  },

  async cloudSave(){
    if(!SB.ready())return;
    try{
      const month=BC.MAX_MONTH||new Date().toISOString().slice(0,7);
      // Nhận diện báo cáo trùng tháng đã có trên cloud
      let exists=false;
      try{const rows=await SB.listReports();exists=rows.some(r=>r.type==='bc'&&r.month===month);}catch(e){}
      if(exists&&!confirm("CẢNH BÁO TRÙNG DỮ LIỆU\n\nTháng "+dispMonth(month)+" ĐÃ CÓ báo cáo đại lý trên cloud.\n\nBạn có muốn THAY THẾ báo cáo cũ bằng kết quả vừa tính không?")){
        BC.log('☁ Không lưu — giữ nguyên báo cáo cũ tháng '+dispMonth(month)+' trên cloud.');
        return;
      }
      BC.log('☁ Đang lưu lên cloud...');
      await SB.saveReport('bc',month,{ROWS:BC.ROWS,AGENTS:BC.AGENTS,MAX_MONTH:BC.MAX_MONTH});
      const allFiles=[...BC.fileStore.f1,...BC.fileStore.f2,...BC.fileStore.f3];
      await SB.uploadOriginals(allFiles,'bc',month);
      BC.log('☁ Đã lưu cloud: báo cáo + '+allFiles.length+' file gốc ✓');
      logAction('Lưu báo cáo đại lý','Tháng '+dispMonth(month)+' · '+allFiles.length+' file · '+BC.ROWS.length+' KH hợp lệ');
    }catch(e){
      console.error('BC.cloudSave',e);
      BC.log('☁ Lỗi lưu cloud: '+(e.message||e));
    }
  },

  async toggleCloudMenu(ev){
    ev.stopPropagation();
    const menu=document.getElementById('bcHistMenu');
    if(menu.classList.contains('show')){menu.classList.remove('show');return;}
    menu.classList.add('show');
    if(!SB.ready()){
      menu.innerHTML="<div class='upload-dd-item' style='color:var(--mu);cursor:default'>Chưa cấu hình cloud — điền SB_URL và SB_KEY trong file</div>";
      return;
    }
    menu.innerHTML="<div class='upload-dd-item' style='color:var(--mu);cursor:default'>Đang tải danh sách...</div>";
    try{
      const rows=(await SB.listReports()).filter(r=>r.type==='bc');
      if(!rows.length){
        menu.innerHTML="<div class='upload-dd-item' style='color:var(--mu);cursor:default'>Chưa có báo cáo nào trên cloud</div>";
        return;
      }
      menu.innerHTML=rows.map(r=>`<div class="upload-dd-item" onclick="BC.loadCloud('${r.month}')">Tháng ${dispMonth(r.month)}</div>`).join('');
    }catch(e){
      console.error('BC.toggleCloudMenu',e);
      menu.innerHTML="<div class='upload-dd-item' style='color:var(--re);cursor:default'>Lỗi tải danh sách cloud</div>";
    }
  },

  async loadCloud(month){
    document.getElementById('bcHistMenu').classList.remove('show');
    try{
      BC.showOverlay('Đang tải tháng '+dispMonth(month)+' từ cloud...');
      const data=await SB.loadReport('bc',month);
      if(!data){BC.hideOverlay();BC.log('☁ Không có dữ liệu tháng '+dispMonth(month));return;}
      BC.ROWS=data.ROWS||[];BC.AGENTS=data.AGENTS||[];BC.MAX_MONTH=data.MAX_MONTH||month;
      BC.filtAll=[...BC.ROWS];BC.filtAgents=[...BC.AGENTS];BC.pgAll=1;BC.pgAgents=1;
      const badge=document.getElementById('bc-ds-badge');
      badge.textContent='CLOUD '+dispMonth(month);badge.style.background='#7c3aed';badge.style.color='white';
      BC.hideOverlay();BC.rebuildAll();
      BC.log('☁ Đã tải tháng '+dispMonth(month)+' từ cloud ✓');
    }catch(e){
      console.error('BC.loadCloud',e);
      BC.hideOverlay();
      BC.log('☁ Lỗi tải cloud: '+(e.message||e));
    }
  },

  resetToDefault(){
    if(CUR_PROFILE&&!canEdit('bc')){alert('Bạn chỉ có quyền XEM báo cáo đại lý.');return;}
    BC.ROWS=[];BC.AGENTS=[];BC.MAX_MONTH='';
    BC.filtAll=[];BC.filtAgents=[];BC.pgAll=1;BC.pgAgents=1;
    ['f1','f2','f3'].forEach(k=>BC.fileStore[k]=[]);
    ['bc-ft1','bc-ft2','bc-ft3'].forEach(id=>document.getElementById(id).innerHTML='');
    ['bc-dz1','bc-dz2','bc-dz3'].forEach(id=>document.getElementById(id).classList.remove('loaded'));
    const ul=document.getElementById('bc-upload-log');ul.textContent='';ul.classList.add('hidden');
    document.getElementById('bc-btn-process').disabled=true;
    const badge=document.getElementById('bc-ds-badge');badge.textContent='TRỐNG';badge.style.background='#9ca3af';badge.style.color='white';
    BC.rebuildAll();BC.log('↺ Đã xóa. Upload file mới để tính toán.');
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
    const ct=r.chi_tieu==='Đạt'?'<span class="b-dat">Đạt</span>':'<span class="b-chua">Chưa</span>';
    /* Ô đại lý gộp (rowspan): tên click được -> Kiểm Tra Đại Lý; ADMIN có ô tích Nghi Ngờ */
    let agCell='';
    if(isFirst){
      const ag=String(r.dai_ly).replace(/'/g,"\\'");
      const flagged=BC.isSuspect(r.dai_ly);
      const chk=(CUR_PROFILE&&CUR_PROFILE.is_admin)
        ?`<label style="display:flex;align-items:center;justify-content:center;gap:4px;font-size:9px;color:${flagged?'#f87171':'var(--mu2)'};cursor:pointer;font-weight:700"><input type="checkbox" ${flagged?'checked':''} onchange="BC.toggleSuspect('${ag}',this)" style="accent-color:#ef4444;cursor:pointer">Nghi ngờ</label>`
        :'';
      agCell=`<td rowspan="${agSpan||1}" style="vertical-align:middle">
        <div style="display:flex;flex-direction:column;align-items:center;gap:5px;padding:2px">
          <b style="cursor:pointer;color:#9f67ff;text-decoration:underline" title="Bấm để kiểm tra đại lý" onclick="BC.goAgent('${ag}')">${hesc(r.dai_ly)}</b>
          ${chk}
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
    document.getElementById('bc-cnt-all').textContent=BC.filtAll.length+' kết quả';
    BC.renderPg('bc-pg-all',BC.filtAll.length,BC.pgAll,p=>{BC.pgAll=p;BC.renderAll();});
  },

  filterAll(){
    const q=document.getElementById('bc-s-all').value.toLowerCase();
    BC.filtAll=q?BC.ROWS.filter(r=>r.id.toLowerCase().includes(q)||r.ho_ten.toLowerCase().includes(q)||r.dai_ly.toLowerCase().includes(q)||(r.ngan_hang||'').toLowerCase().includes(q)):[...BC.ROWS];
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

  /* ---- Tô ô nghi ngờ trong Kiểm Tra Đại Lý (SESSION-ONLY — F5 là mất) ----
     MARKS[agent] = Set("rowIdx|field") · bấm ô để tô/bỏ tô · khi gửi báo cáo Telegram,
     genExcel tô đúng các ô này (cam, riêng Âm/Dương đỏ nhạt) */
  MARKS:{},
  mkSet(ag){return BC.MARKS[ag]||(BC.MARKS[ag]=new Set());},
  mkAttr(ag,i,f,cls){
    const on=BC.mkSet(ag).has(i+'|'+f);
    return `class="bc-mkc${cls?' '+cls:''}${on?(f==='am_duong'?' bc-mk-ad':' bc-mk'):''}" onclick="BC.markCell(this,${i},'${f}')"`;
  },
  markCell(td,i,f){
    const ag=document.getElementById('bc-agent-select').value;
    if(!ag)return;
    const s=BC.mkSet(ag),k=i+'|'+f;
    if(s.has(k)){s.delete(k);td.classList.remove('bc-mk','bc-mk-ad');}
    else{s.add(k);td.classList.add(f==='am_duong'?'bc-mk-ad':'bc-mk');}
  },
  // Thứ tự field khớp 23 cột của genExcel/Google Sheet ('' = cột trống Cổng/Khu vực)
  XLS_FIELDS:['','dai_ly','id','cap_bac','ho_ten','khach','chi_tieu','','tien_nap','lan_nap','tien_rut','lan_rut','am_duong','cuoc_hop_le','ngan_hang','chi_nhanh','stk','ip','','link_dk','link_dn','thiet_bi','game'],

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
      const tb=r.thiet_bi==='Điện thoại'?'<span class="b-dt">ĐT</span>':'<span class="b-mt">MT</span>';
      const kh=r.khach==='Mới'?'<span class="b-moi">Mới</span>':'<span class="b-cu">Cũ</span>';
      const ct=r.chi_tieu==='Đạt'?'<span class="b-dat">Đạt</span>':'<span class="b-chua">Chưa</span>';
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

  goAgent(name){document.getElementById('bc-agent-select').value=name;BC.loadAgent();BC.showPanel('detail');},

  initCards(){
    const tn=BC.ROWS.reduce((s,r)=>s+r.tien_nap,0);
    const tr=BC.ROWS.reduce((s,r)=>s+r.tien_rut,0);
    const tc=BC.ROWS.reduce((s,r)=>s+r.cuoc_hop_le,0);
    const moi=BC.ROWS.filter(r=>r.khach==='Mới').length;
    document.getElementById('bc-summary-cards').innerHTML=`
      <div class="card"><div class="card-label">Đại lý đủ điều kiện</div><div class="card-value">${BC.AGENTS.length}</div></div>
      <div class="card"><div class="card-label">Tổng KH hợp lệ</div><div class="card-value">${BC.ROWS.length}</div></div>
      <div class="card"><div class="card-label">KH mới (${BC.MAX_MONTH})</div><div class="card-value" style="color:#3b82f6">${moi}</div></div>
      <div class="card"><div class="card-label">KH cũ</div><div class="card-value" style="color:#6b7280">${BC.ROWS.length-moi}</div></div>
      <div class="card"><div class="card-label">Tổng tiền nạp</div><div class="card-value">${BC.fmt(tn)}</div></div>
      <div class="card"><div class="card-label">Tổng tiền rút</div><div class="card-value">${BC.fmt(tr)}</div></div>
      <div class="card"><div class="card-label">Âm/Dương</div><div class="card-value" style="color:${tn-tr>=0?'#16a34a':'#dc2626'}">${BC.fmt(tn-tr)}</div></div>
      <div class="card"><div class="card-label">Tổng cược HL</div><div class="card-value">${BC.fmt(Math.round(tc))}</div></div>`;
  },

  rebuildAll(){
    BC.initCards();BC.renderAll();BC.renderAgents();
    const sel=document.getElementById('bc-agent-select');
    sel.innerHTML='<option value="">-- Chọn đại lý --</option>';
    BC.AGENTS.forEach(a=>{const o=document.createElement('option');o.value=a.dai_ly;o.textContent=`${a.dai_ly} (${a.khach_hop_le} KH hợp lệ)`;sel.appendChild(o);});
    document.getElementById('bc-body-detail').innerHTML='<tr><td colspan="20" class="empty">Chọn đại lý để xem chi tiết</td></tr>';
    document.getElementById('bc-info-bar').style.display='none';
  },

  renderPg(id,total,cur,onClick){
    const pages=Math.ceil(total/BC.PS);
    if(pages<=1){document.getElementById(id).innerHTML='';return;}
    let h=`<span class="pg-info">Trang ${cur}/${pages}</span>`;
    if(cur>1)h+=`<button class="pg-btn" onclick="(${onClick})(${cur-1})">‹</button>`;
    for(let p=Math.max(1,cur-2);p<=Math.min(pages,cur+2);p++)
      h+=`<button class="pg-btn ${p===cur?'on':''}" onclick="(${onClick})(${p})">${p}</button>`;
    if(cur<pages)h+=`<button class="pg-btn" onclick="(${onClick})(${cur+1})">›</button>`;
    document.getElementById(id).innerHTML=h;
  },

  showPanel(n){
    document.querySelectorAll('#t2 .bc-panel').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('#t2 .bc-tab').forEach(t=>t.classList.remove('active'));
    document.getElementById('bc-panel-'+n).classList.add('active');
    document.querySelectorAll('#t2 .bc-tab')[{summary:0,agents:1,detail:2,suspect:3}[n]].classList.add('active');
    if(n==='suspect')BC.renderSuspects();
  },

  /* ===== NGHI NGỜ (chỉ ADMIN) — lưu cloud, không mất khi F5 ===== */
  SUSPECTS:[],
  isSuspect(ag){return BC.SUSPECTS.some(x=>x.dai_ly===ag);},
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
    try{
      if(BC.isSuspect(ag)){
        BC.SUSPECTS=BC.SUSPECTS.filter(x=>x.dai_ly!==ag);
        logAction('Bỏ nghi ngờ đại lý',ag);
      }else{
        const summary=BC.AGENTS.find(a=>a.dai_ly===ag)||null;
        const members=BC.ROWS.filter(r=>r.dai_ly===ag);
        BC.SUSPECTS.push({dai_ly:ag,at:new Date().toISOString(),by:CUR_PROFILE.username,summary,members});
        logAction('Đánh dấu nghi ngờ đại lý',ag+' · '+members.length+' KH hợp lệ');
      }
      await SB.saveReport('suspects','all',{list:BC.SUSPECTS});
      BC.updateSuspectBadge();
      BC.renderAll();
      if(document.getElementById('bc-panel-suspect').classList.contains('active'))BC.renderSuspects();
    }catch(e){
      console.error('toggleSuspect',e);
      alert('Lỗi lưu nghi ngờ: '+(e.message||e));
      if(cb)cb.checked=!cb.checked;
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
        <button onclick="BC.suspectToggleDetail(${idx})" style="padding:2px 9px;background:var(--card2);color:var(--mu2);border:1px solid var(--border2);border-radius:4px;cursor:pointer;font-size:10px">Chi tiết KH (${(s.members||[]).length})</button>
        <button onclick="BC.toggleSuspect('${String(s.dai_ly).replace(/'/g,"\\'")}',null)" style="padding:2px 9px;background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.35);border-radius:4px;cursor:pointer;font-size:10px;margin-left:auto">Bỏ nghi ngờ</button>
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
    const isAdm=!!(CUR_PROFILE&&CUR_PROFILE.is_admin);
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
        ${isAdm?`<button onclick="BC.removeSuspectSep(${g.sepIdx})" title="Xóa phân cách này (gộp lại với giai đoạn sau)" style="padding:2px 9px;background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.35);border-radius:4px;cursor:pointer;font-size:10px;white-space:nowrap">✕ Xóa phân cách</button>`:''}
        <div style="flex:1;height:2px;background:repeating-linear-gradient(90deg,var(--go) 0 10px,transparent 10px 18px)"></div>
      </div>`;
      return h;
    }).join('');
  },
  async addSuspectSep(){
    if(!CUR_PROFILE||!CUR_PROFILE.is_admin){alert('Chỉ tài khoản ADMIN mới chèn được phân cách giai đoạn.');return;}
    if(!BC.suspectCount()){alert('Chưa có đại lý nghi ngờ nào — hãy đánh dấu đại lý trước khi phân cách giai đoạn.');return;}
    if(BC.SUSPECTS.length&&BC.SUSPECTS[BC.SUSPECTS.length-1].sep){alert('Phần cuối danh sách đã là một phân cách — hãy thêm đại lý cho giai đoạn mới trước khi phân cách tiếp.');return;}
    try{
      BC.SUSPECTS.push({sep:true,at:new Date().toISOString(),by:CUR_PROFILE.username});
      await SB.saveReport('suspects','all',{list:BC.SUSPECTS});
      logAction('Chèn phân cách giai đoạn nghi ngờ','Sau '+BC.suspectCount()+' đại lý');
      BC.renderSuspects();
    }catch(e){console.error('addSuspectSep',e);alert('Lỗi lưu phân cách: '+(e.message||e));BC.SUSPECTS=BC.SUSPECTS.filter((x,i)=>i!==BC.SUSPECTS.length-1);}
  },
  async removeSuspectSep(idx){
    if(!CUR_PROFILE||!CUR_PROFILE.is_admin){alert('Chỉ tài khoản ADMIN mới xóa được phân cách giai đoạn.');return;}
    const s=BC.SUSPECTS[idx];
    if(!s||!s.sep)return;
    try{
      BC.SUSPECTS.splice(idx,1);
      await SB.saveReport('suspects','all',{list:BC.SUSPECTS});
      logAction('Xóa phân cách giai đoạn nghi ngờ','');
      BC.renderSuspects();
    }catch(e){console.error('removeSuspectSep',e);alert('Lỗi xóa phân cách: '+(e.message||e));BC.loadSuspects().then(()=>BC.renderSuspects());}
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
    const cm=new Set(s.cellMarks||[]),k=i+'|'+f;
    if(cm.has(k)){cm.delete(k);td.classList.remove('bc-mk','bc-mk-ad');}
    else{cm.add(k);td.classList.add(f==='am_duong'?'bc-mk-ad':'bc-mk');}
    s.cellMarks=[...cm];
    try{await SB.saveReport('suspects','all',{list:BC.SUSPECTS});}
    catch(e){console.error('suspectMark',e);alert('Lỗi lưu tô nghi ngờ: '+(e.message||e));}
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

  openBtModal(){
    if(CUR_PROFILE&&!canEdit('bc')){alert('Bạn chỉ có quyền XEM, không được gửi báo cáo.');return;}
    const name=document.getElementById('bc-agent-select').value;
    if(!name){alert('Vui lòng chọn đại lý trước!');return;}
    const ag=BC.AGENTS.find(a=>a.dai_ly===name);
    document.getElementById('bc-bt-agent-info').innerHTML=
      `<b>Đại lý: ${name}</b> &nbsp;·&nbsp; KH hợp lệ: ${ag?ag.khach_hop_le:0} &nbsp;·&nbsp; Tổng thành viên: ${ag?ag.tong_thanh_vien:0}`;
    BC._selFk=null;
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
      const res=await BC.callSendReport('dai_ly','fk'+BC._selFk.toLowerCase(),content,agentName,[file]);
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

  genExcel(rows,agentName,marks){
    /* SpreadsheetML XML — explicit ss:Type per cell → STK stays text, colors via ss:Interior */
    const HDRS=['STT','Đại lý','Tên tài khoản','Cấp bậc','Họ tên đăng kí','Khách','Chỉ tiêu','Cổng','Tổng nạp','Lần nạp','Tổng rút','Lần rút','Âm/Dương','Cược hợp lệ','Ngân hàng','Chi nhánh','STK','IP','Khu vực','IP đăng ký','IP đăng nhập','Thiết bị','Sảnh'];
    const CW=[28,60,80,95,125,40,50,45,70,50,70,50,70,72,75,75,100,82,60,120,120,60,120];
    const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const B='<Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>';
    const c=(v,sty,forceStr=false)=>{
      const num=!forceStr&&v!==''&&v!==null&&v!==undefined&&String(v).trim()!==''&&!isNaN(Number(v));
      return`<Cell ss:StyleID="${sty}"><Data ss:Type="${num?'Number':'String'}">${esc(num?v:String(v??''))}</Data></Cell>`;
    };
    let x=`<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
<Style ss:ID="h"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Borders>${B}</Borders><Font ss:Bold="1" ss:Name="Arial" ss:Size="10"/><Interior ss:Color="#F4B084" ss:Pattern="Solid"/></Style>
<Style ss:ID="d"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders>${B}</Borders><Font ss:Name="Arial" ss:Size="10"/><Interior ss:Color="#FFF2CC" ss:Pattern="Solid"/></Style>
<Style ss:ID="a"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders>${B}</Borders><Font ss:Name="Arial" ss:Size="10"/><Interior ss:Color="#F4B084" ss:Pattern="Solid"/></Style>
<Style ss:ID="m"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders>${B}</Borders><Font ss:Name="Arial" ss:Size="10" ss:Bold="1"/><Interior ss:Color="#F4B084" ss:Pattern="Solid"/></Style>
<Style ss:ID="r"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders>${B}</Borders><Font ss:Name="Arial" ss:Size="10" ss:Bold="1" ss:Color="#9C0006"/><Interior ss:Color="#FFC7CE" ss:Pattern="Solid"/></Style>
</Styles>
<Worksheet ss:Name="Báo cáo"><Table>
${CW.map(w=>`<Column ss:Width="${w}"/>`).join('')}
<Row ss:AutoFitHeight="1">${HDRS.map(h=>c(h,'h')).join('')}</Row>`;
    rows.forEach((r,i)=>{
      const vals=[i+1,r.dai_ly,r.id,r.cap_bac,r.ho_ten,r.khach,r.chi_tieu,'',r.tien_nap,r.lan_nap,r.tien_rut,r.lan_rut,r.am_duong,r.cuoc_hop_le,r.ngan_hang,r.chi_nhanh,r.stk,r.ip,'',r.link_dk,r.link_dn,r.thiet_bi,r.game];
      x+=`<Row>${vals.map((v,ci)=>{
        const f=BC.XLS_FIELDS[ci];
        let sty=ci===1?'a':'d';
        if(marks&&f&&marks.has(i+'|'+f))sty=f==='am_duong'?'r':'m';
        return c(v,sty,ci===16);
      }).join('')}</Row>`;
    });
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
      const res=await BC.callSendReport('cuoc','fk'+BC._selCuFk.toLowerCase(),content,'',files);
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

BC.rebuildAll();
AUTH.init();
