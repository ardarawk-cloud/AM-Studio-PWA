(()=>{
  if(document.documentElement.dataset.amDistribution==='play')return;

  const css=`
  #am-admin-launch{position:fixed;left:14px;bottom:82px;z-index:9998;border:1px solid #364154;background:#101722;color:#fff;border-radius:16px;padding:11px 15px;font:900 13px system-ui;box-shadow:0 12px 34px #0008}
  #am-admin-panel{position:fixed;inset:0;z-index:10020;background:#05070bf8;color:#fff;font-family:system-ui,-apple-system,Segoe UI,sans-serif;overflow:auto;display:none}
  #am-admin-panel.open{display:block}
  .ama-shell{max-width:680px;margin:auto;padding:12px 12px 120px}
  .ama-top{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 0;background:#05070bf2;backdrop-filter:blur(14px)}
  .ama-title{font-size:21px;font-weight:950}.ama-sub,.ama-note{font-size:12px;color:#98a2b3;line-height:1.45}
  .ama-card{border:1px solid #283446;background:#0d131d;border-radius:20px;padding:14px;margin:10px 0}
  .ama-label{display:block;font-size:11px;font-weight:900;letter-spacing:.04em;color:#cbd3df;margin:12px 0 7px}
  .ama-input,.ama-select,.ama-btn{width:100%;border:1px solid #344155;background:#121a26;color:#fff;border-radius:14px;padding:13px;font:inherit}
  .ama-btn{font-weight:900;cursor:pointer}.ama-btn.primary{background:#fff;color:#090c11;border-color:#fff;font-size:16px;padding:15px}.ama-btn.ghost{background:#151d29}.ama-btn.danger{border-color:#6c343d;color:#ffaaa4}
  .ama-close{width:auto;padding:10px 13px}.ama-row{display:flex;gap:9px;align-items:center}.ama-row>*{min-width:0}.ama-row .grow{flex:1}
  .ama-unlocked{color:#72e7ad}.ama-bad{color:#ff9d97}.ama-ok{color:#72e7ad}
  .ama-coverbox{display:flex;gap:12px;align-items:center}.ama-cover-preview{width:86px;aspect-ratio:2/3;border-radius:14px;border:1px solid #344155;background:#080c12 center/cover no-repeat;flex:0 0 auto}
  .ama-drop{display:block;border:1.5px dashed #53627a;border-radius:18px;padding:19px 14px;text-align:center;background:#0a1018;cursor:pointer}
  .ama-drop b{display:block;font-size:16px}.ama-drop span{display:block;font-size:11px;color:#9ba6b7;margin-top:5px}
  #amaPages{position:absolute;opacity:0;pointer-events:none;width:1px;height:1px}
  .ama-media-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}
  .ama-media{position:relative;border:1px solid #2e394a;background:#080c12;border-radius:14px;overflow:hidden;aspect-ratio:3/4}
  .ama-media img{width:100%;height:100%;object-fit:cover;display:block}
  .ama-media-num{position:absolute;left:6px;top:6px;background:#070a0ed9;border:1px solid #ffffff2b;border-radius:999px;padding:4px 7px;font-size:10px;font-weight:900}
  .ama-media-x{position:absolute;right:6px;top:6px;border:0;background:#db2833;color:#fff;width:28px;height:28px;border-radius:999px;font-size:19px;font-weight:900;line-height:24px}
  .ama-media-actions{position:absolute;left:5px;right:5px;bottom:5px;display:flex;gap:4px}
  .ama-media-actions button{flex:1;border:1px solid #ffffff30;background:#05070bd9;color:#fff;border-radius:8px;padding:5px 0;font-weight:900}
  .ama-summary{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:10px;padding:10px 12px;border-radius:14px;background:#111926;border:1px solid #2e394a}
  .ama-summary b{font-size:13px}.ama-summary span{font-size:11px;color:#9ca7b7}
  .ama-status{white-space:pre-wrap;font-size:12px;line-height:1.55;color:#d8dde6}
  .ama-bar{height:9px;background:#1d2735;border-radius:999px;overflow:hidden;margin-top:10px}.ama-bar i{display:block;height:100%;width:0;background:#72e7ad;transition:width .18s}
  .ama-published{border-color:#2d654b;background:#0d1b16}
  .ama-hidden{display:none!important}
  details.ama-tools>summary{cursor:pointer;font-weight:900;color:#b8c0cc}
  @media(max-width:420px){.ama-media-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ama-shell{padding-left:10px;padding-right:10px}}
  `;
  const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);

  const launch=document.createElement('button');launch.id='am-admin-launch';launch.textContent='ADMIN';document.body.appendChild(launch);
  const panel=document.createElement('section');panel.id='am-admin-panel';
  panel.innerHTML=`
  <div class="ama-shell">
    <div class="ama-top">
      <div><div class="ama-title">Publish Comic</div><div class="ama-sub">AM STUDIO Owner</div></div>
      <button class="ama-btn ama-close ghost" id="amaClose">Tutup</button>
    </div>

    <div class="ama-card" id="amaAuthCard">
      <div class="ama-row">
        <div class="grow"><b>Admin</b><div class="ama-note" id="amaAuth">Belum unlock</div></div>
        <button class="ama-btn ghost" style="width:auto" id="amaUnlock">UNLOCK</button>
      </div>
      <input class="ama-input ama-hidden" id="amaKey" type="password" autocomplete="off">
    </div>

    <div class="ama-card">
      <label class="ama-label">KOMIK</label>
      <select class="ama-select" id="amaSeries"></select>

      <div class="ama-coverbox" style="margin-top:13px">
        <div class="ama-cover-preview" id="amaPreview"></div>
        <div style="flex:1;min-width:0">
          <b id="amaSeriesName">—</b>
          <div class="ama-note" id="amaSeriesState">Pilih komik.</div>
          <label class="ama-btn ghost" style="display:inline-block;width:auto;margin-top:8px;padding:9px 11px;cursor:pointer">
            GANTI COVER
            <input id="amaCover" type="file" accept="image/jpeg,image/png,image/webp,image/avif" style="display:none">
          </label>
        </div>
      </div>

      <div class="ama-row" style="margin-top:12px">
        <div style="width:105px">
          <label class="ama-label">EPISODE</label>
          <input class="ama-input" id="amaEpisode" type="number" min="1" max="999" value="1">
        </div>
        <div class="grow">
          <label class="ama-label">JUDUL — opsional</label>
          <input class="ama-input" id="amaTitle" placeholder="Episode 001">
        </div>
      </div>
      <input id="amaTotal" type="hidden" value="">
    </div>

    <div class="ama-card">
      <label class="ama-drop" for="amaPages">
        <b>＋ TAMBAH GAMBAR PAGE</b>
        <span>Pilih semua halaman dari galeri. Bisa tambah lagi kalau kurang.</span>
      </label>
      <input id="amaPages" type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif">

      <div class="ama-summary">
        <div><b id="amaPicked">Belum ada page</b><span id="amaOrderHint">Urutan terlihat di preview sebelum Publish.</span></div>
        <button class="ama-btn ghost" id="amaClear" style="width:auto;padding:8px 10px">RESET</button>
      </div>

      <div class="ama-media-grid" id="amaMediaGrid"></div>

      <button class="ama-btn primary" id="amaUpload" style="margin-top:15px">PUBLISH EPISODE</button>
      <div class="ama-note" style="margin-top:8px;text-align:center">Tidak akan dinyatakan berhasil sebelum semua page terverifikasi di storage.</div>
    </div>

    <div class="ama-card" id="amaStatusCard">
      <b>Status</b>
      <div class="ama-status" id="amaStatus" style="margin-top:7px">Siap.</div>
      <div class="ama-bar"><i id="amaBar"></i></div>
      <button class="ama-btn ghost ama-hidden" id="amaSeeLibrary" style="margin-top:12px">TUTUP & LIHAT LIBRARY</button>
    </div>
  </div>`;
  document.body.appendChild(panel);

  const $=s=>panel.querySelector(s);
  const series=$('#amaSeries'),episode=$('#amaEpisode'),title=$('#amaTitle'),total=$('#amaTotal'),cover=$('#amaCover'),preview=$('#amaPreview'),seriesName=$('#amaSeriesName'),seriesState=$('#amaSeriesState'),pagesInput=$('#amaPages'),grid=$('#amaMediaGrid'),picked=$('#amaPicked'),status=$('#amaStatus'),bar=$('#amaBar'),upload=$('#amaUpload'),seeLibrary=$('#amaSeeLibrary'),auth=$('#amaAuth');

  let catalog={series:[]},registry={episodes:[]},queue=[],coverFile=null,coverPreviewUrl=null,busy=false;
  const objectUrls=new Set();
  const pad=(n,w=2)=>String(n).padStart(w,'0');
  const adminKey=()=>sessionStorage.getItem('am_admin_key')||'';

  function cleanupUrls(){for(const u of objectUrls)URL.revokeObjectURL(u);objectUrls.clear()}
  function setAuth(){const ok=!!adminKey();auth.textContent=ok?'✓ UNLOCKED':'Belum unlock';auth.className='ama-note '+(ok?'ama-unlocked':'')}
  function currentSeries(){return (catalog.series||[]).find(s=>String(s.id)===String(series.value))}
  function currentAsset(){return (registry.episodes||[]).find(e=>String(e.seriesId)===String(series.value)&&Number(e.episode)===Number(episode.value))}
  async function json(url,opt={}){const r=await fetch(url,{cache:'no-store',...opt});let x={};try{x=await r.json()}catch{}if(!r.ok||x.ok===false)throw new Error(x.error||`HTTP ${r.status}`);return x}
  async function loadData(){
    const [c,r]=await Promise.all([
      fetch('/catalog.json?t='+Date.now(),{cache:'no-store'}).then(x=>x.json()),
      fetch('/reader-assets.json?t='+Date.now(),{cache:'no-store'}).then(x=>x.json())
    ]);
    catalog=c;registry=r;
    const keep=series.value;
    series.innerHTML=(catalog.series||[]).map(s=>`<option value="${s.id}">${s.title}</option>`).join('');
    if(keep&&[...series.options].some(o=>o.value===keep))series.value=keep;
    syncSeries();
  }
  function syncSeries(){
    const s=currentSeries();if(!s)return;
    seriesName.textContent=s.title;
    preview.style.backgroundImage=`url('/media/comics/${encodeURIComponent(s.id)}/cover.jpg?t=${Date.now()}')`;
    syncEpisode();
  }
  function syncEpisode(){
    const a=currentAsset(),n=Array.isArray(a?.pages)?a.pages.filter(Boolean).length:0;
    total.value=n||'';
    title.value=a?.title&&!/^Episode \d+$/i.test(a.title)?a.title:'';
    seriesState.textContent=n?`Episode ${episode.value} saat ini: ${n} page`:`Episode ${episode.value}: belum ada page terverifikasi`;
  }

  function renderQueue(){
    cleanupUrls();
    picked.textContent=queue.length?`${queue.length} PAGE SIAP DIPUBLISH`:'Belum ada page';
    total.value=queue.length||currentAsset()?.pageCount||'';
    grid.innerHTML='';
    queue.forEach((file,i)=>{
      const u=URL.createObjectURL(file);objectUrls.add(u);
      const card=document.createElement('div');card.className='ama-media';
      card.innerHTML=`<img src="${u}" alt="Page ${i+1}"><span class="ama-media-num">PAGE ${pad(i+1)}</span><button type="button" class="ama-media-x" data-x="${i}">×</button><div class="ama-media-actions"><button type="button" data-left="${i}">‹</button><button type="button" data-right="${i}">›</button></div>`;
      grid.appendChild(card);
    });
    grid.querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>{queue.splice(Number(b.dataset.x),1);renderQueue()});
    grid.querySelectorAll('[data-left]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.left);if(i<=0)return;[queue[i-1],queue[i]]=[queue[i],queue[i-1]];renderQueue()});
    grid.querySelectorAll('[data-right]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.right);if(i>=queue.length-1)return;[queue[i+1],queue[i]]=[queue[i],queue[i+1]];renderQueue()});
  }

  async function sendFile(file,keyName){
    return json('/api/assets/upload?key='+encodeURIComponent(keyName),{method:'POST',headers:{'x-am-studio-admin-key':adminKey(),'content-type':file.type||'image/jpeg'},body:file});
  }
  async function saveMeta(payload){
    return json('/api/assets/meta',{method:'POST',headers:{'x-am-studio-admin-key':adminKey(),'content-type':'application/json'},body:JSON.stringify(payload)});
  }
  async function trimTo(seriesId,ep,count){
    return json(`/api/assets/series/${encodeURIComponent(seriesId)}/episodes/${ep}/trim/${count}`,{method:'DELETE',headers:{'x-am-studio-admin-key':adminKey(),'x-am-delete-confirmation':`${seriesId}:${ep}:trim:${count}`}});
  }
  async function verify(seriesId,ep,count){
    const prefix=`comics/${seriesId}/ep${pad(ep,3)}/`;
    const x=await json('/api/assets/list?prefix='+encodeURIComponent(prefix),{headers:{'x-am-studio-admin-key':adminKey()}});
    const keys=new Set((x.objects||[]).map(o=>o.key));
    const missing=[];
    for(let i=1;i<=count;i++){
      const key=`${prefix}page-${pad(i)}.jpg`;
      if(!keys.has(key))missing.push(i);
    }
    const actualPages=(x.objects||[]).map(o=>(String(o.key).match(/page-(\d{2,3})\./i)||[])[1]).filter(Boolean).map(Number);
    const extra=actualPages.filter(n=>n>count);
    return {missing,extra,actual:[...new Set(actualPages)].sort((a,b)=>a-b)};
  }

  async function unlock(){
    const k=prompt('Masukkan AM STUDIO Admin Key');
    if(!k)return;
    sessionStorage.setItem('am_admin_key',k.trim());
    try{
      await json('/api/assets/list?prefix='+encodeURIComponent('comics/'),{headers:{'x-am-studio-admin-key':adminKey()}});
      setAuth();status.textContent='Admin unlocked.';
    }catch(e){sessionStorage.removeItem('am_admin_key');setAuth();alert('Admin Key salah / tidak aktif.')}
  }

  $('#amaUnlock').onclick=unlock;
  $('#amaClose').onclick=()=>panel.classList.remove('open');
  launch.onclick=async()=>{panel.classList.add('open');setAuth();try{await loadData()}catch(e){status.textContent='Gagal membaca Library: '+e.message}};
  series.onchange=()=>{queue=[];coverFile=null;if(coverPreviewUrl){URL.revokeObjectURL(coverPreviewUrl);coverPreviewUrl=null}renderQueue();syncSeries()};
  episode.onchange=()=>{queue=[];renderQueue();syncEpisode()};
  cover.onchange=()=>{coverFile=cover.files?.[0]||null;if(coverPreviewUrl){URL.revokeObjectURL(coverPreviewUrl);coverPreviewUrl=null}if(coverFile){coverPreviewUrl=URL.createObjectURL(coverFile);preview.style.backgroundImage=`url('${coverPreviewUrl}')`}};
  pagesInput.onchange=()=>{
    const files=[...(pagesInput.files||[])];
    if(files.length)queue.push(...files);
    pagesInput.value='';
    renderQueue();
  };
  $('#amaClear').onclick=()=>{queue=[];renderQueue();status.textContent='Pilihan page dikosongkan.'};

  upload.onclick=async()=>{
    if(busy)return;
    const s=currentSeries(),ep=Number(episode.value),count=queue.length,episodeTitle=title.value.trim()||`Episode ${pad(ep,3)}`;
    if(!adminKey())return unlock();
    if(!s||!Number.isInteger(ep)||ep<1)return alert('Pilih komik dan episode.');
    if(!count)return alert('Belum ada gambar page. Tambahkan page dulu sebelum Publish.');
    if(!confirm(`Publish ${s.title} • Episode ${ep} • ${count} page?\n\nUrutan akan mengikuti preview di panel.`))return;

    busy=true;upload.disabled=true;seeLibrary.classList.add('ama-hidden');bar.style.width='0%';
    const totalSteps=count+(coverFile?1:0)+3;let done=0;
    const tick=t=>{done++;bar.style.width=Math.min(100,Math.round(done/totalSteps*100))+'%';status.textContent=t};

    try{
      if(coverFile){await sendFile(coverFile,`comics/${s.id}/cover.jpg`);tick('✓ Cover tersimpan')}
      for(let i=0;i<count;i++){
        await sendFile(queue[i],`comics/${s.id}/ep${pad(ep,3)}/page-${pad(i+1)}.jpg`);
        tick(`Uploading page ${i+1}/${count}…`);
      }

      await saveMeta({seriesId:s.id,episode:ep,title:episodeTitle,pageCount:count,ownerApproved:true});tick('✓ Metadata tersimpan');
      await trimTo(s.id,ep,count);tick('✓ Sisa page lama dibersihkan');

      const check=await verify(s.id,ep,count);
      if(check.missing.length||check.extra.length)throw new Error(`VERIFY_FAILED • missing: ${check.missing.join(',')||'-'} • extra: ${check.extra.join(',')||'-'}`);
      tick('✓ Semua page terverifikasi');

      await loadData();
      status.innerHTML=`<span class="ama-ok">✓ PUBLISHED</span>\n${s.title} • Episode ${pad(ep,3)}\n${count}/${count} page terverifikasi di storage. Reader siap.`;
      $('#amaStatusCard').classList.add('ama-published');
      queue=[];coverFile=null;cover.value='';if(coverPreviewUrl){URL.revokeObjectURL(coverPreviewUrl);coverPreviewUrl=null}renderQueue();seeLibrary.classList.remove('ama-hidden');
      window.dispatchEvent(new Event('am-admin-assets-changed'));
    }catch(e){
      status.innerHTML=`<span class="ama-bad">PUBLISH GAGAL</span>\n${String(e.message||e)}\n\nTidak dinyatakan berhasil. Pilih page lalu Publish lagi.`;
    }finally{busy=false;upload.disabled=false}
  };

  seeLibrary.onclick=()=>{
    sessionStorage.setItem('am_owner_skip_admin_once','1');
    location.reload();
  };

  setAuth();
})();