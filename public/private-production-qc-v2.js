(()=>{
  let upgraded=false,autoArmed=false,busy=false,selectedPage=null,currentStatus=null,currentBlobUrl='',zoom=1,lastOpen=false;
  const key=()=>sessionStorage.getItem('am_admin_key')||'';
  const division=()=>document.querySelector('#appComic')?.value||'blackjack';
  const q=s=>document.querySelector(s);
  async function api(action,opt={}){
    const r=await fetch(`/api/production/${division()}/${action}`,{
      cache:'no-store',...opt,
      headers:{...(opt.headers||{}),'x-am-studio-admin-key':key(),...(opt.json?{'content-type':'application/json'}:{})},
      body:opt.json?JSON.stringify(opt.json):opt.body
    });
    let x={};try{x=await r.json()}catch{}
    if(!r.ok||x.ok===false)throw new Error(x.error||`HTTP ${r.status}`);
    return x;
  }
  const pagesOf=s=>Array.isArray(s?.generatedPages)?s.generatedPages.map(Number).filter(Number.isInteger).sort((a,b)=>a-b):[];
  const firstPending=s=>pagesOf(s).find(p=>String(s?.pageQc?.[String(p)]||'')!=='PASS')||null;
  function setBusy(v){busy=v;['#appAuto','#appNext','#appPass','#appRegen'].forEach(id=>{const b=q(id);if(b)b.disabled=v})}
  function updateNav(){
    const list=pagesOf(currentStatus),i=list.indexOf(Number(selectedPage));
    const prev=q('#appQcPrev'),next=q('#appQcNext'),label=q('#appQcLabel');
    if(prev)prev.disabled=i<=0;if(next)next.disabled=i<0||i>=list.length-1;
    if(label)label.textContent=selectedPage?`PAGE ${selectedPage} / ${currentStatus?.totalPages||'—'}`:'NO PAGE';
  }
  function render(s){
    currentStatus=s;
    const list=pagesOf(s),pending=firstPending(s),state=q('#appState'),info=q('#appInfo'),pages=q('#appPages'),bar=q('#appBar'),gen=q('#appGen');
    if(pages)pages.textContent=`${list.length}/${s.totalPages} pages`;
    if(bar)bar.style.width=`${s.totalPages?Math.round(list.length/s.totalPages*100):0}%`;
    if(gen){gen.textContent=s.generatorConfigured?'CLOUDFLARE AI READY':'GENERATOR NOT CONFIGURED';gen.className='app-pill '+(s.generatorConfigured?'app-good':'app-warntext')}
    if(state&&!busy){
      if(pending)state.textContent=`WAITING_OWNER_QC — PAGE ${pending}`;
      else if(!s.nextPage&&list.length)state.textContent='ALL PAGES GENERATED — OWNER QC';
      else state.textContent=s.productionState||'NOT_STARTED';
    }
    if(info&&!busy){
      if(pending)info.textContent=`QC dulu Page ${pending}. AUTO tidak akan membuat page baru sebelum semua page sebelumnya PASS.`;
      else info.textContent=`Next: ${s.nextPage?'Page '+s.nextPage:'semua page sudah ada'} • ${s.releaseState||'PRIVATE_STAGING'} • viewer: HIDDEN`;
    }
    updateNav();
  }
  async function status(){const s=await api('status');render(s);return s}
  async function showPage(page){
    if(!page)return;
    const ep=Number(currentStatus?.episode||1);
    const r=await fetch(`/api/production/${division()}/preview?episode=${ep}&page=${page}&t=${Date.now()}`,{cache:'no-store',headers:{'x-am-studio-admin-key':key()}});
    if(!r.ok)throw new Error(`PREVIEW_PAGE_${page}_NOT_FOUND`);
    if(currentBlobUrl)URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl=URL.createObjectURL(await r.blob());
    selectedPage=Number(page);
    const img=q('#appPreview'),note=q('#appPreviewNote');
    if(img){img.src=currentBlobUrl;img.style.display='block';img.style.cursor='zoom-in'}
    if(note)note.textContent=`Private preview • Page ${page} • tap gambar / FULL SCREEN untuk perbesar`;
    const light=q('#appQcZoomImage');if(light)light.src=currentBlobUrl;
    updateNav();
  }
  async function focusPendingOrLast(s=currentStatus){
    const pending=firstPending(s),list=pagesOf(s),target=pending||selectedPage||list.at(-1)||null;
    if(target&&list.includes(Number(target)))await showPage(target);
    else{selectedPage=null;const img=q('#appPreview'),note=q('#appPreviewNote');if(img)img.style.display='none';if(note)note.textContent='Belum ada preview.';updateNav()}
  }
  async function generateOne(){
    setBusy(true);const state=q('#appState'),info=q('#appInfo');if(state)state.textContent='GENERATING ONE PAGE…';if(info)info.textContent='Menunggu Cloudflare AI. Setelah selesai sistem berhenti untuk Owner QC.';
    try{
      const x=await api('generate-next',{method:'POST'}),s=await status();
      if(x.page)await showPage(x.page);else await focusPendingOrLast(s);
      const st=q('#appState');if(st&&x.page)st.textContent=`WAITING_OWNER_QC — PAGE ${x.page}`;
      return s;
    }finally{setBusy(false)}
  }
  async function startAuto(){
    if(busy)return;
    autoArmed=true;
    try{
      await api('start',{method:'POST'});const s=await status();
      if(!s.generatorConfigured)throw new Error('CLOUDFLARE_AI_NOT_READY');
      const pending=firstPending(s);
      if(pending){await showPage(pending);return}
      if(s.nextPage)await generateOne();
    }catch(e){autoArmed=false;const st=q('#appState'),info=q('#appInfo');if(st)st.textContent='STOPPED';if(info)info.textContent=e.message}
  }
  async function manualNext(){
    if(busy)return;
    try{
      await api('start',{method:'POST'});const s=await status(),pending=firstPending(s);
      if(pending){await showPage(pending);const info=q('#appInfo');if(info)info.textContent=`Page ${pending} masih menunggu QC. PASS / REGENERATE dulu sebelum membuat page berikutnya.`;return}
      if(s.nextPage)await generateOne();
    }catch(e){const info=q('#appInfo');if(info)info.textContent=e.message}
  }
  async function passPage(){
    if(!selectedPage||busy)return;
    try{
      setBusy(true);await api('page-qc',{method:'POST',json:{page:selectedPage,result:'PASS'}});let s=await status();
      const pending=firstPending(s);
      if(pending){await showPage(pending);return}
      if(autoArmed&&s.nextPage){setBusy(false);await generateOne();return}
      if(!s.nextPage){const st=q('#appState');if(st)st.textContent='ALL GENERATED — FINAL OWNER QC'}
      else await focusPendingOrLast(s);
    }catch(e){const info=q('#appInfo');if(info)info.textContent=e.message}
    finally{setBusy(false)}
  }
  async function regeneratePage(){
    if(!selectedPage||busy)return;
    if(!confirm(`Regenerate Page ${selectedPage}? Page ini akan diganti, page lain tetap aman.`))return;
    try{
      const page=selectedPage;setBusy(true);await api('page-qc',{method:'POST',json:{page,result:'REGENERATE'}});setBusy(false);await generateOne();
    }catch(e){const info=q('#appInfo');if(info)info.textContent=e.message;setBusy(false)}
  }
  async function pause(){autoArmed=false;try{await api('pause',{method:'POST'});const s=await status();await focusPendingOrLast(s)}catch(e){const info=q('#appInfo');if(info)info.textContent=e.message}}
  function applyZoom(){const img=q('#appQcZoomImage'),label=q('#appQcZoomLabel');if(img)img.style.width=`${Math.round(zoom*100)}%`;if(label)label.textContent=`${Math.round(zoom*100)}%`}
  function openZoom(){if(!currentBlobUrl)return;zoom=1;const box=q('#appQcLightbox'),img=q('#appQcZoomImage');if(img)img.src=currentBlobUrl;if(box)box.classList.add('open');applyZoom()}
  function closeZoom(){const box=q('#appQcLightbox');if(box)box.classList.remove('open')}
  function addQcUi(panel){
    const style=document.createElement('style');style.textContent=`#appQcNav{margin-top:10px;align-items:center}.app-qc-label{font:900 11px system-ui;color:#cbd2dd;padding:8px 4px}#appQcLightbox{position:fixed;inset:0;z-index:10150;background:#020306f8;display:none;color:#fff}#appQcLightbox.open{display:block}.app-qc-tools{position:sticky;top:0;z-index:2;display:flex;gap:7px;align-items:center;padding:10px;background:#080b11ee;border-bottom:1px solid #2f3540}.app-qc-stage{height:calc(100vh - 64px);overflow:auto;-webkit-overflow-scrolling:touch;padding:8px}.app-qc-stage img{display:block;width:100%;max-width:none;height:auto;margin:0 auto}.app-qc-spacer{flex:1}`;document.head.appendChild(style);
    const preview=q('#appPreview');
    const nav=document.createElement('div');nav.id='appQcNav';nav.className='app-row';nav.innerHTML=`<button class="app-btn" id="appQcPrev">← PAGE</button><span class="app-qc-label" id="appQcLabel">NO PAGE</span><button class="app-btn" id="appQcNext">PAGE →</button><button class="app-btn primary" id="appQcFull">⌕ FULL SCREEN</button>`;
    preview?.parentElement?.insertBefore(nav,q('#appPreviewNote')?.nextSibling||null);
    const light=document.createElement('div');light.id='appQcLightbox';light.innerHTML=`<div class="app-qc-tools"><button class="app-btn" id="appQcMinus">−</button><span class="app-qc-label" id="appQcZoomLabel">100%</span><button class="app-btn" id="appQcPlus">+</button><button class="app-btn" id="appQcReset">100%</button><span class="app-qc-spacer"></span><button class="app-btn primary" id="appQcClose">Tutup</button></div><div class="app-qc-stage" id="appQcStage"><img id="appQcZoomImage"></div>`;document.body.appendChild(light);
    q('#appQcPrev').onclick=async()=>{const list=pagesOf(currentStatus),i=list.indexOf(Number(selectedPage));if(i>0)await showPage(list[i-1])};
    q('#appQcNext').onclick=async()=>{const list=pagesOf(currentStatus),i=list.indexOf(Number(selectedPage));if(i>=0&&i<list.length-1)await showPage(list[i+1])};
    q('#appQcFull').onclick=openZoom;preview.onclick=openZoom;q('#appQcClose').onclick=closeZoom;
    q('#appQcMinus').onclick=()=>{zoom=Math.max(1,zoom-.5);applyZoom()};q('#appQcPlus').onclick=()=>{zoom=Math.min(4,zoom+.5);applyZoom()};q('#appQcReset').onclick=()=>{zoom=1;applyZoom()};
    q('#appQcZoomImage').ondblclick=()=>{zoom=zoom===1?2:1;applyZoom()};
  }
  function installUpgrade(){
    const panel=q('#am-private-prod');if(upgraded||!panel||!q('#appAuto'))return;
    upgraded=true;addQcUi(panel);
    const auto=q('#appAuto'),next=q('#appNext'),pass=q('#appPass'),regen=q('#appRegen'),pauseBtn=q('#appPause');
    auto.textContent='▶ AUTO PRODUCE + OWNER QC';auto.onclick=startAuto;next.onclick=manualNext;pass.onclick=passPage;regen.onclick=regeneratePage;pauseBtn.onclick=pause;
    const note=auto.closest('.app-card')?.querySelector('.app-note');if(note)note.textContent='AUTO membuat SATU page, lalu WAJIB berhenti untuk Owner QC. PASS melanjutkan ke page berikutnya; REGENERATE membuat ulang page yang sedang diperiksa.';
    updateNav();
  }
  setInterval(async()=>{
    installUpgrade();
    const panel=q('#am-private-prod'),open=panel?.classList.contains('open');
    if(open&&!lastOpen&&upgraded){lastOpen=true;setTimeout(async()=>{try{const s=await status();await focusPendingOrLast(s)}catch{}},500)}
    if(!open)lastOpen=false;
  },350);
})();
