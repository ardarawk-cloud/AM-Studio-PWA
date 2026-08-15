(()=>{
  if(window.__amPlayReaderV2)return;
  window.__amPlayReaderV2=true;

  const isPlay=()=>document.documentElement.dataset.amDistribution==='play'||new URLSearchParams(location.search).get('channel')==='play';
  if(!isPlay())return;

  let scheduled=false;
  let policyLoading=null;
  let catalogSeries=[];
  const readyBySeries=new Map();

  const version=()=>{
    const m=navigator.userAgent.match(/AMStudioAndroid\/([^\s]+)/);
    return m?.[1]||'Play';
  };

  function completeReaderAsset(asset){
    if(!asset||asset.canonState!=='CANON_FINAL'||asset.qc!=='QC_PASS')return false;
    if(asset.replacementPending===true)return false;
    if(String(asset.readerState||'').includes('PARTIAL'))return false;

    const readerAsset=typeof asset.readerAsset==='string'&&asset.readerAsset.trim().length>0;
    const pages=Array.isArray(asset.pages)?asset.pages.filter(Boolean):[];
    const total=Number(asset.pageCount||0);
    const available=Number(asset.availablePageCount||pages.length||0);
    const missing=Array.isArray(asset.missingReaderPages)?asset.missingReaderPages.filter(Boolean):[];
    const completePages=total>0&&pages.length>=total&&available>=total&&missing.length===0;

    return readerAsset||completePages;
  }

  async function loadReleasePolicy(){
    if(policyLoading)return policyLoading;
    policyLoading=Promise.all([
      fetch('/catalog.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('CATALOG_UNAVAILABLE');return r.json()}),
      fetch('/reader-assets.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('READER_REGISTRY_UNAVAILABLE');return r.json()})
    ]).then(([catalog,registry])=>{
      catalogSeries=Array.isArray(catalog?.series)?catalog.series:[];
      readyBySeries.clear();
      for(const asset of Array.isArray(registry?.episodes)?registry.episodes:[]){
        if(!completeReaderAsset(asset))continue;
        const id=String(asset.seriesId||'').trim();
        const episode=Number(asset.episode);
        if(!id||!Number.isFinite(episode))continue;
        if(!readyBySeries.has(id))readyBySeries.set(id,new Set());
        readyBySeries.get(id).add(episode);
      }
      document.documentElement.dataset.amPlayPolicy='loaded';
    }).catch(error=>{
      console.error('AM_PLAY_RELEASE_POLICY_FAILED',error);
      readyBySeries.clear();
      document.documentElement.dataset.amPlayPolicy='failed-closed';
    }).finally(()=>schedule());
    return policyLoading;
  }

  function hideOwnerControls(){
    ['am-admin-launch','am-page-control-launch','am-admin-panel','am-page-control'].forEach(id=>{
      const el=document.getElementById(id);
      if(el)el.style.setProperty('display','none','important');
    });
  }

  function publicBranding(){
    document.title='AM STUDIO — Official Comics Reader';

    const top=document.querySelector('.topbar');
    if(top){
      const small=top.querySelector('small');
      const pill=top.querySelector('.pill');
      if(small)small.textContent='Official Comics Reader';
      if(pill){
        pill.textContent='PUBLIC READER';
        pill.style.color='var(--green,#66e3a4)';
      }
    }

    const hero=document.querySelector('.hero');
    const heading=hero?.querySelector('h2')?.textContent||'';
    if(hero&&/Read\.\s*Collect/i.test(heading)){
      const eyebrow=hero.querySelector('.eyebrow');
      const copy=hero.querySelector('p');
      if(eyebrow)eyebrow.textContent='OFFICIAL COMICS READER';
      if(copy)copy.textContent='Baca universe original AM STUDIO. Reader publik hanya menampilkan episode yang sudah CANON FINAL, QC PASS, dan memiliki aset reader lengkap.';
    }
  }

  function currentSeriesId(){
    const direct=document.querySelector('.back[data-series]')?.dataset.series;
    if(direct)return direct;
    const title=(document.querySelector('.hero h2')?.textContent||document.querySelector('.reader-head .eyebrow')?.textContent||'').trim();
    if(!title)return null;
    return catalogSeries.find(series=>String(series?.title||'').trim()===title)?.id||null;
  }

  function ensureEmptyNotice(container,id,text){
    if(!container||container.querySelector(`#${id}`))return;
    const note=document.createElement('div');
    note.id=id;
    note.className='empty-state';
    note.innerHTML=`<b>Konten sedang disiapkan</b><p>${text}</p>`;
    container.appendChild(note);
  }

  function filterUnreleasedContent(){
    if(document.documentElement.dataset.amPlayPolicy!=='loaded')return;

    document.querySelectorAll('.card[data-series]').forEach(card=>{
      const id=card.dataset.series;
      card.style.display=readyBySeries.has(id)&&readyBySeries.get(id).size?'':'none';
    });

    document.querySelectorAll('.cards').forEach(container=>{
      const visible=[...container.querySelectorAll('.card[data-series]')].some(card=>card.style.display!=='none');
      if(!visible)ensureEmptyNotice(container,'amPlayLibraryGate','Belum ada episode dengan aset lengkap yang dibuka untuk Google Play Reader.');
    });

    const seriesId=currentSeriesId();
    const readyEpisodes=seriesId?readyBySeries.get(seriesId):null;
    document.querySelectorAll('.episode[data-episode]').forEach(row=>{
      const episode=Number(row.dataset.episode);
      row.style.display=readyEpisodes?.has(episode)?'':'none';
    });

    const episodeList=document.querySelector('.episodes');
    if(episodeList&&seriesId){
      const visible=[...episodeList.querySelectorAll('.episode[data-episode]')].some(row=>row.style.display!=='none');
      if(!visible)ensureEmptyNotice(episodeList,'amPlayEpisodeGate','Episode seri ini belum memiliki paket reader lengkap untuk rilis publik.');
    }
  }

  function renderPublicProfile(){
    const active=document.querySelector('[data-nav="profile"].active');
    const shell=document.querySelector('#app .shell');
    if(!active||!shell||shell.querySelector('#amNativePublicProfile'))return;

    shell.innerHTML=`
      <div id="amNativePublicProfile">
        <div class="topbar">
          <div class="brand"><div class="logo">AM</div><div><h1>AM STUDIO</h1><small>Official Comics Reader</small></div></div>
          <span class="pill" style="color:var(--green,#66e3a4)">PUBLIC READER</span>
        </div>
        <div class="profilebox">
          <span class="eyebrow">ABOUT</span>
          <h3>AM STUDIO Reader</h3>
          <p>Baca komik original AM STUDIO, simpan progres bacaan, dan ikuti universe resmi dari perangkat ini.</p>
          <div class="row"><span class="pill">Version ${version()}</span><span class="pill">Reader only</span></div>
        </div>
        <div class="section">
          <div class="profilebox">
            <b>Privasi</b>
            <p>Reader publik tidak memerlukan akun. Progres baca disimpan lokal pada perangkat.</p>
            <p><a class="cta" href="/privacy-policy.html" style="display:inline-block;text-decoration:none">Kebijakan Privasi</a></p>
          </div>
          <div class="profilebox">
            <b>Release Policy</b>
            <p>Konten publik wajib CANON FINAL + QC PASS dan seluruh aset reader untuk episode tersebut harus lengkap. Draft, recovery parsial, panel Admin, dan alat produksi internal tidak tersedia pada build Play Store.</p>
          </div>
        </div>
      </div>`;
  }

  function run(){
    scheduled=false;
    hideOwnerControls();
    publicBranding();
    filterUnreleasedContent();
    renderPublicProfile();
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(run);
  }

  const observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('popstate',schedule);
  addEventListener('pageshow',schedule);
  loadReleasePolicy();
  schedule();
})();
