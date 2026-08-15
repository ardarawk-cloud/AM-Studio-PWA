(()=>{
  if(window.__amPlayReaderV3)return;
  window.__amPlayReaderV3=true;

  const isPlay=()=>document.documentElement.dataset.amDistribution==='play'||new URLSearchParams(location.search).get('channel')==='play';
  if(!isPlay())return;

  document.documentElement.dataset.amDistribution='play';
  document.documentElement.dataset.amPlayReader='v3';

  let scheduled=false;
  let policyLoading=null;
  let catalogSeries=[];
  const readyBySeries=new Map();

  const playUrl=path=>{
    const url=new URL(path,location.origin);
    url.searchParams.set('channel','play');
    return url.pathname+url.search;
  };

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
    return readerAsset||(total>0&&pages.length>=total&&available>=total&&missing.length===0);
  }

  async function loadReleasePolicy(){
    if(policyLoading)return policyLoading;
    policyLoading=Promise.all([
      fetch(playUrl('/catalog.json'),{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('CATALOG_UNAVAILABLE');return r.json()}),
      fetch(playUrl('/reader-assets.json'),{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('READER_REGISTRY_UNAVAILABLE');return r.json()})
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

  function installOwnerControlFirewall(){
    if(document.getElementById('am-native-owner-firewall'))return;
    const style=document.createElement('style');
    style.id='am-native-owner-firewall';
    style.textContent=`
      html[data-am-distribution="play"] #am-admin-launch,
      html[data-am-distribution="play"] #am-admin-panel,
      html[data-am-distribution="play"] #am-page-control-launch,
      html[data-am-distribution="play"] #am-page-control,
      html[data-am-distribution="play"] #am-asset-upload-launch,
      html[data-am-distribution="play"] #am-asset-upload,
      html[data-am-distribution="play"] [id^="am-private-production"],
      html[data-am-distribution="play"] [id^="am-qc-"]{display:none!important}`;
    document.head.appendChild(style);
  }

  function hideOwnerControls(){
    installOwnerControlFirewall();
    const selectors=[
      '#am-admin-launch','#am-admin-panel',
      '#am-page-control-launch','#am-page-control',
      '#am-asset-upload-launch','#am-asset-upload',
      '[id^="am-private-production"]','[id^="am-qc-"]'
    ];
    document.querySelectorAll(selectors.join(',')).forEach(el=>el.remove());
  }

  function publicBranding(){
    document.title='AM STUDIO — Official Comics Reader';
    const top=document.querySelector('.topbar,.top');
    if(top){
      const small=top.querySelector('small,.tiny');
      const pill=top.querySelector('.pill.beta,.pill');
      if(small)small.textContent='Official Comics Reader';
      if(pill){
        pill.textContent='PUBLIC READER';
        pill.classList.remove('beta');
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
    const stored=sessionStorage.getItem('am_current_series');
    const title=(document.querySelector('.universe h2')?.textContent||document.querySelector('.hero h2')?.textContent||document.querySelector('.reader-head .eyebrow')?.textContent||'').trim();
    if(title){
      const match=catalogSeries.find(series=>String(series?.title||'').trim()===title)?.id;
      if(match)return match;
    }
    return stored||null;
  }

  function ensureEmptyNotice(container,id,text){
    if(!container||container.querySelector(`#${id}`))return;
    const note=document.createElement('div');
    note.id=id;
    note.className='empty-state notice';
    note.innerHTML=`<b>Konten sedang disiapkan</b><p>${text}</p>`;
    container.appendChild(note);
  }

  function filterUnreleasedContent(){
    if(document.documentElement.dataset.amPlayPolicy!=='loaded')return;

    document.querySelectorAll('.card[data-series],.card[data-open]').forEach(card=>{
      const id=card.dataset.series||card.dataset.open;
      card.style.display=readyBySeries.has(id)&&readyBySeries.get(id).size?'':'none';
    });

    document.querySelectorAll('.cards,.grid').forEach(container=>{
      const cards=[...container.querySelectorAll('.card[data-series],.card[data-open]')];
      if(!cards.length)return;
      const visible=cards.some(card=>card.style.display!=='none');
      if(!visible)ensureEmptyNotice(container,'amPlayLibraryGate','Belum ada episode dengan aset lengkap yang dibuka untuk Google Play Reader.');
    });

    const seriesId=currentSeriesId();
    const readyEpisodes=seriesId?readyBySeries.get(seriesId):null;
    document.querySelectorAll('.episode[data-episode],.ep[data-ep]').forEach(row=>{
      const episode=Number(row.dataset.episode||row.dataset.ep);
      row.style.display=readyEpisodes?.has(episode)?'':'none';
    });

    const episodeList=document.querySelector('.episodes');
    if(episodeList&&seriesId){
      const rows=[...episodeList.querySelectorAll('.episode[data-episode],.ep[data-ep]')];
      if(rows.length&&!rows.some(row=>row.style.display!=='none'))ensureEmptyNotice(episodeList,'amPlayEpisodeGate','Episode seri ini belum memiliki paket reader lengkap untuk rilis publik.');
    }
  }

  function renderPublicProfile(){
    const active=document.querySelector('[data-nav="profile"].active,[data-tab="profile"].active');
    const shell=document.querySelector('#app.shell')||document.querySelector('#app .shell');
    if(!active||!shell||shell.querySelector('#amNativePublicProfile'))return;
    shell.innerHTML=`
      <div id="amNativePublicProfile">
        <div class="top">
          <div class="brand"><img class="logo" src="/icon.svg" alt="AM STUDIO"><div><h1>AM STUDIO</h1><div class="tiny">Official Comics Reader</div></div></div>
          <span class="pill" style="color:var(--green,#66e3a4)">PUBLIC READER</span>
        </div>
        <div class="box">
          <span class="eyebrow">ABOUT</span>
          <h2>AM STUDIO Reader</h2>
          <p>Baca komik original AM STUDIO, simpan progres bacaan, dan ikuti universe resmi dari perangkat ini.</p>
          <div class="row"><span class="pill">Version ${version()}</span><span class="pill">Reader only</span></div>
        </div>
        <div class="box">
          <b>Privasi</b>
          <p>Reader publik tidak memerlukan akun. Progres baca disimpan lokal pada perangkat.</p>
          <p><a class="btn ghost" href="/privacy-policy.html" style="display:inline-block;text-decoration:none">Kebijakan Privasi</a></p>
        </div>
        <div class="box">
          <b>Release Policy</b>
          <p>Konten publik wajib CANON FINAL + QC PASS dan seluruh aset reader untuk episode tersebut harus lengkap. Draft, recovery parsial, panel Admin, dan alat produksi internal tidak tersedia pada build Play Store.</p>
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

  document.addEventListener('click',event=>{
    const card=event.target.closest?.('.card[data-open],.card[data-series]');
    const id=card?.dataset?.open||card?.dataset?.series;
    if(id)sessionStorage.setItem('am_current_series',id);
  },true);

  const observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('popstate',schedule);
  addEventListener('pageshow',schedule);
  loadReleasePolicy();
  schedule();
})();
