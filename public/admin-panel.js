(()=>{
  const css=`
  #am-admin-launch{position:fixed;left:14px;bottom:82px;z-index:9998;border:1px solid #364154;background:#101722;color:#fff;border-radius:14px;padding:10px 13px;font:850 12px system-ui;box-shadow:0 12px 34px #0008}
  #am-admin-panel{position:fixed;inset:0;z-index:10020;background:#05070bf7;color:#fff;font-family:system-ui,-apple-system,Segoe UI,sans-serif;overflow:auto;display:none}
  #am-admin-panel.open{display:block}.ama-shell{max-width:720px;margin:auto;padding:14px 14px 120px}.ama-top{position:sticky;top:0;z-index:4;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;background:#05070bf2;backdrop-filter:blur(12px)}
  .ama-card{border:1px solid #293345;background:#0e141d;border-radius:18px;padding:14px;margin:10px 0}.ama-title{font-size:20px;font-weight:900}.ama-sub,.ama-note{font-size:12px;color:#98a2b3;line-height:1.5}.ama-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ama-label{display:block;font-size:11px;font-weight:850;color:#c9d0dc;margin:11px 0 6px}.ama-input,.ama-btn,.ama-select{width:100%;border:1px solid #334155;background:#111823;color:#fff;border-radius:12px;padding:12px;font:inherit}.ama-btn{font-weight:850;cursor:pointer}.ama-btn.primary{background:#fff;color:#080b10}.ama-btn.ghost{background:#151c27}.ama-btn.danger{border-color:#69363d;color:#ff9d97}.ama-close{width:auto}.ama-status{white-space:pre-wrap;font-size:12px;line-height:1.55;color:#d8dde6}.ama-ok{color:#72e7ad}.ama-bad{color:#ff9d97}.ama-bar{height:8px;background:#1d2735;border-radius:999px;overflow:hidden;margin-top:10px}.ama-bar i{display:block;height:100%;width:0;background:#72e7ad;transition:width .18s}.ama-row{display:flex;gap:8px;flex-wrap:wrap}.ama-pill{display:inline-flex;border:1px solid #334155;border-radius:999px;padding:6px 9px;font-size:10px;color:#b8c0cd}.ama-cover-preview{width:92px;aspect-ratio:2/3;border-radius:12px;border:1px solid #334155;background:#0a0e14 center/cover no-repeat;flex:0 0 auto}.ama-series-head{display:flex;gap:12px;align-items:center}.ama-series-head>div:last-child{min-width:0;flex:1}.ama-series-name{font-weight:900;font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  @media(max-width:520px){.ama-grid{grid-template-columns:1fr}.ama-shell{padding-left:12px;padding-right:12px}}
  `;
  const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);
  const launch=document.createElement('button');launch.id='am-admin-launch';launch.textContent='ADMIN';document.body.appendChild(launch);
  const panel=document.createElement('section');panel.id='am-admin-panel';panel.innerHTML=`
    <div class="ama-shell">
      <div class="ama-top"><div><div class="ama-title">AM STUDIO Admin</div><div class="ama-sub">Comic Asset Manager • R2</div></div><button class="ama-btn ama-close ghost" id="amaClose">Tutup</button></div>
      <div class="ama-card">
        <b>Admin Access</b><div class="ama-note">Pakai AM_STUDIO_ADMIN_KEY yang sama. Disimpan hanya di session browser.</div>
        <div class="ama-row" style="margin-top:10px"><input class="ama-input" style="flex:1;min-width:180px" id="amaKey" type="password" placeholder="Admin key"><button class="ama-btn ghost" style="width:auto" id="amaUnlock">Unlock</button></div>
        <div class="ama-note" id="amaAuth" style="margin-top:8px">Belum unlock.</div>
      </div>
      <div class="ama-card">
        <label class="ama-label">KOMIK / SERIES</label><select class="ama-select" id="amaSeries"></select>
        <div class="ama-series-head" style="margin-top:12px"><div class="ama-cover-preview" id="amaPreview"></div><div><div class="ama-series-name" id="amaSeriesName">—</div><div class="ama-note" id="amaSeriesState">Pilih series.</div></div></div>
        <label class="ama-label">COVER — opsional</label><input class="ama-input" id="amaCover" type="file" accept="image/jpeg,image/png,image/webp,image/avif">
      </div>
      <div class="ama-card">
        <b>Episode Manager</b>
        <div class="ama-grid">
          <div><label class="ama-label">EPISODE</label><input class="ama-input" id="amaEpisode" type="number" min="1" max="999" value="1"></div>
          <div><label class="ama-label">TOTAL PAGE EPISODE</label><input class="ama-input" id="amaTotal" type="number" min="1" max="999" placeholder="contoh: 22"></div>
        </div>
        <label class="ama-label">JUDUL EPISODE</label><input class="ama-input" id="amaTitle" placeholder="Judul episode">
        <div class="ama-grid">
          <div><label class="ama-label">MULAI DARI PAGE</label><input class="ama-input" id="amaStart" type="number" min="1" max="999" value="1"></div>
          <div><label class="ama-label">FILE PAGE — pilih banyak sekaligus</label><input class="ama-input" id="amaPages" type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif"></div>
        </div>
        <div class="ama-note" id="amaPicked" style="margin-top:9px">Belum ada page dipilih.</div>
        <button class="ama-btn primary" id="amaUpload" style="margin-top:14px">UPLOAD / UPDATE EPISODE</button>
      </div>
      <div class="ama-card"><b>Status</b><div class="ama-status" id="amaStatus" style="margin-top:8px">Siap.</div><div class="ama-bar"><i id="amaBar"></i></div></div>
    </div>`;
  document.body.appendChild(panel);
  const $=s=>panel.querySelector(s);
  const key=$('#amaKey'),auth=$('#amaAuth'),series=$('#amaSeries'),preview=$('#amaPreview'),seriesName=$('#amaSeriesName'),seriesState=$('#amaSeriesState'),cover=$('#amaCover'),episode=$('#amaEpisode'),total=$('#amaTotal'),title=$('#amaTitle'),start=$('#amaStart'),pages=$('#amaPages'),picked=$('#amaPicked'),upload=$('#amaUpload'),status=$('#amaStatus'),bar=$('#amaBar');
  let catalog={series:[]},registry={episodes:[]};
  function adminKey(){return sessionStorage.getItem('am_admin_key')||''}
  function setAuth(){const ok=!!adminKey();auth.textContent=ok?'✓ Admin unlocked untuk session ini.':'Belum unlock.';auth.className='ama-note '+(ok?'ama-ok':'')}
  function sortedFiles(){return [...(pages.files||[])].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}))}
  function pad(n,w=2){return String(n).padStart(w,'0')}
  async function json(url,opt={}){const r=await fetch(url,{cache:'no-store',...opt});let x={};try{x=await r.json()}catch{};if(!r.ok||x.ok===false)throw new Error(x.error||`HTTP ${r.status}`);return x}
  async function refreshData(){
    const [c,r]=await Promise.all([fetch('/catalog.json?t='+Date.now(),{cache:'no-store'}).then(x=>x.json()),fetch('/reader-assets.json?t='+Date.now(),{cache:'no-store'}).then(x=>x.json())]);catalog=c;registry=r;
    series.innerHTML=(catalog.series||[]).map(s=>`<option value="${s.id}">${s.code||s.id.toUpperCase()} — ${s.title}</option>`).join('');
    syncSeries();
  }
  function currentSeries(){return (catalog.series||[]).find(s=>s.id===series.value)}
  function currentAsset(){return (registry.episodes||[]).find(e=>e.seriesId===series.value&&Number(e.episode)===Number(episode.value))}
  function syncSeries(){
    const s=currentSeries();if(!s)return;
    seriesName.textContent=s.title;preview.style.backgroundImage=`url('/media/comics/${s.id}/cover.jpg?t=${Date.now()}')`;
    const assets=(registry.episodes||[]).filter(e=>e.seriesId===s.id);seriesState.textContent=assets.length?`${assets.length} episode asset terdaftar.`:'Belum ada episode asset di Reader.';
    syncEpisode();
  }
  function syncEpisode(){
    const a=currentAsset();
    if(a){title.value=a.title||'';total.value=a.pageCount||'';const nums=(a.pages||[]).map(p=>Number((p.match(/page-(\d+)/i)||[])[1])).filter(Boolean);start.value=nums.length?Math.max(...nums)+1:1}
    else{title.value='';total.value='';start.value=1}
    refreshPicked();
  }
  function refreshPicked(){const p=sortedFiles(),st=Number(start.value)||1;picked.textContent=p.length?`${p.length} file dipilih • akan menjadi Page ${st}–${st+p.length-1}`:'Belum ada page dipilih.'}
  async function sendFile(file,keyName){
    if(!adminKey())throw new Error('ADMIN_KEY_BELUM_UNLOCK');
    return json('/api/assets/upload?key='+encodeURIComponent(keyName),{method:'POST',headers:{'x-am-studio-admin-key':adminKey(),'content-type':file.type||'image/jpeg'},body:file});
  }
  async function saveMeta(payload){return json('/api/assets/meta',{method:'POST',headers:{'x-am-studio-admin-key':adminKey(),'content-type':'application/json'},body:JSON.stringify(payload)})}
  $('#amaUnlock').onclick=()=>{if(!key.value.trim())return alert('Masukkan admin key.');sessionStorage.setItem('am_admin_key',key.value.trim());key.value='';setAuth();status.textContent='Admin key tersimpan untuk session ini.'};
  $('#amaClose').onclick=()=>panel.classList.remove('open');
  launch.onclick=async()=>{panel.classList.add('open');setAuth();try{await refreshData()}catch(e){status.textContent='Gagal membaca catalog: '+e.message}};
  series.onchange=syncSeries;episode.onchange=syncEpisode;start.oninput=refreshPicked;pages.onchange=refreshPicked;
  upload.onclick=async()=>{
    const s=currentSeries(),ep=Number(episode.value),files=sortedFiles(),first=Number(start.value)||1,pageCount=Number(total.value)||0,episodeTitle=title.value.trim()||`Episode ${pad(ep,3)}`;
    if(!adminKey())return alert('Unlock Admin dulu.');
    if(!s||!ep)return alert('Pilih series dan episode.');
    if(!cover.files?.[0]&&!files.length&&!pageCount)return alert('Pilih cover/page atau isi metadata episode.');
    if(!confirm(`Update ${s.title} • Episode ${ep}?`))return;
    upload.disabled=true;let done=0,steps=(cover.files?.[0]?1:0)+files.length+1;bar.style.width='0%';
    const tick=t=>{done++;bar.style.width=Math.round(done/steps*100)+'%';status.textContent=t};
    try{
      if(cover.files?.[0]){await sendFile(cover.files[0],`comics/${s.id}/cover.jpg`);tick('✓ Cover uploaded')}
      for(let i=0;i<files.length;i++){const pageNo=first+i;await sendFile(files[i],`comics/${s.id}/ep${pad(ep,3)}/page-${pad(pageNo)}.jpg`);tick(`✓ Uploaded Page ${pageNo} (${i+1}/${files.length})`)}
      const inferred=Math.max(pageCount,files.length?first+files.length-1:0,currentAsset()?.pageCount||0);
      await saveMeta({seriesId:s.id,episode:ep,title:episodeTitle,pageCount:inferred||undefined,ownerApproved:true});tick('✓ Metadata episode saved');
      await refreshData();
      status.innerHTML=`<span class="ama-ok">✓ SELESAI</span>\n${s.title} • Episode ${pad(ep,3)}\nReader registry sudah diperbarui dari R2.`;
      cover.value='';pages.value='';refreshPicked();
    }catch(e){status.innerHTML=`<span class="ama-bad">GAGAL</span>\n${String(e.message||e)}`}
    finally{upload.disabled=false}
  };
  setAuth();
})();
