(()=>{
  if(window.__amStudioGrowthV1)return;
  window.__amStudioGrowthV1=true;

  const isPlay=()=>document.documentElement.dataset.amDistribution==='play'||new URLSearchParams(location.search).get('channel')==='play';
  if(!isPlay())return;

  const STORE={
    onboarded:'am_growth_onboarded_v1',
    attribution:'am_growth_attribution_v1',
    events:'am_growth_events_v1',
    knownReleases:'am_growth_known_releases_v1'
  };
  const state={catalog:[],registry:[],ready:new Map(),deepLinkHandled:false,newReleaseCount:0};
  let scheduled=false;

  const safeJson=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch{return fallback}};
  const writeJson=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};
  const playUrl=path=>{const u=new URL(path,location.origin);u.searchParams.set('channel','play');return u.pathname+u.search};

  function track(name,payload={}){
    const events=safeJson(STORE.events,[]);
    events.push({name,at:new Date().toISOString(),...payload});
    writeJson(STORE.events,events.slice(-100));
  }

  function captureAttribution(){
    const params=new URLSearchParams(location.search),keys=['series','episode','campaign','utm_source','utm_medium','utm_campaign','ref'],data={};
    for(const key of keys){const value=params.get(key);if(value)data[key]=String(value).slice(0,160)}
    if(!Object.keys(data).length)return;
    const previous=safeJson(STORE.attribution,{});
    const next={...previous,...data,lastSeenAt:new Date().toISOString()};
    if(!previous.firstSeenAt)next.firstSeenAt=next.lastSeenAt;
    writeJson(STORE.attribution,next);
    track('campaign_attribution',data);
  }

  function complete(asset){
    if(!asset||asset.canonState!=='CANON_FINAL'||asset.qc!=='QC_PASS')return false;
    if(asset.replacementPending===true||String(asset.readerState||'').includes('PARTIAL'))return false;
    const pages=Array.isArray(asset.pages)?asset.pages.filter(Boolean):[];
    const total=Number(asset.pageCount||0),available=Number(asset.availablePageCount||pages.length||0);
    const missing=Array.isArray(asset.missingReaderPages)?asset.missingReaderPages.filter(Boolean):[];
    const readerAsset=typeof asset.readerAsset==='string'&&asset.readerAsset.trim();
    return Boolean(readerAsset||(total>0&&pages.length>=total&&available>=total&&missing.length===0));
  }

  async function loadData(){
    try{
      const [catalog,registry]=await Promise.all([
        fetch(playUrl('/catalog.json'),{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(new Error('CATALOG'))),
        fetch(playUrl('/reader-assets.json'),{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(new Error('REGISTRY')))
      ]);
      state.catalog=Array.isArray(catalog?.series)?catalog.series:[];
      state.registry=Array.isArray(registry?.episodes)?registry.episodes.filter(complete):[];
      state.ready.clear();
      for(const asset of state.registry){
        const id=String(asset.seriesId||''),episode=Number(asset.episode);
        if(!id||!Number.isInteger(episode))continue;
        if(!state.ready.has(id))state.ready.set(id,new Set());
        state.ready.get(id).add(episode);
      }
      detectNewReleases();
      schedule();
      setTimeout(handleDeepLink,120);
    }catch(error){
      console.error('AM_GROWTH_DATA_FAILED',error);
    }
  }

  function detectNewReleases(){
    const current=state.registry.map(x=>`${x.seriesId}:${Number(x.episode)}`).sort();
    const known=safeJson(STORE.knownReleases,[]);
    if(Array.isArray(known)&&known.length){
      state.newReleaseCount=current.filter(x=>!known.includes(x)).length;
      if(state.newReleaseCount)track('new_release_detected',{count:state.newReleaseCount});
    }
    writeJson(STORE.knownReleases,current);
  }

  function seriesById(id){return state.catalog.find(s=>s.id===id)||null}
  function progress(){return safeJson('am_progress',{})}
  function favorites(){return safeJson('am_fav',[])}
  function firstUnreadSeries(){
    const p=progress();
    const campaign=new URLSearchParams(location.search).get('series');
    if(campaign&&state.ready.has(campaign))return seriesById(campaign);
    const fav=favorites().find(id=>state.ready.has(id)&&Number(p[id]||0)<Math.max(...state.ready.get(id)));
    if(fav)return seriesById(fav);
    return state.catalog.find(s=>state.ready.has(s.id)&&Number(p[s.id]||0)<Math.max(...state.ready.get(s.id)))||state.catalog.find(s=>state.ready.has(s.id))||null;
  }

  function installStyle(){
    if(document.getElementById('am-growth-style'))return;
    const style=document.createElement('style');style.id='am-growth-style';style.textContent=`
      #amGrowthOnboarding{position:fixed;inset:0;z-index:20000;background:#05070bf2;display:grid;place-items:end center;padding:18px;backdrop-filter:blur(18px)}
      #amGrowthOnboarding .ag-sheet{width:min(660px,100%);border:1px solid #303a4d;background:linear-gradient(155deg,#20151b,#0b1017 58%);border-radius:28px;padding:22px;box-shadow:0 30px 80px #000b}
      #amGrowthOnboarding h2{font-size:31px;line-height:1.02;margin:8px 0 12px}#amGrowthOnboarding p{color:#c8ced8;line-height:1.55}
      .ag-kicker{font-size:10px;font-weight:900;letter-spacing:.15em;color:#ff776f}.ag-benefits{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:16px 0}
      .ag-benefit,.ag-strip span{border:1px solid #293345;background:#0d131c;border-radius:15px;padding:11px;font-size:11px;color:#d8dde6}.ag-actions{display:flex;gap:9px}.ag-actions button{flex:1}
      #amGrowthFeatured,#amGrowthContinue,#amGrowthNew{border:1px solid #283142;border-radius:22px;background:linear-gradient(145deg,#171d27,#0c1118);padding:15px;margin:14px 0}
      #amGrowthFeatured .ag-feature{display:grid;grid-template-columns:92px 1fr;gap:14px;align-items:center}.ag-feature-cover{width:92px;aspect-ratio:2/3;border-radius:14px;background:#131923 center/cover no-repeat;border:1px solid #30394a}
      #amGrowthFeatured h3,#amGrowthContinue h3{margin:4px 0 6px}.ag-copy{font-size:12px;color:#aeb7c6;line-height:1.45}.ag-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.ag-chip{display:inline-flex;border:1px solid #344054;border-radius:999px;padding:6px 9px;font-size:9px;font-weight:850;color:#cbd3df}
      .ag-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:12px 0 18px}.ag-strip span{text-align:center;padding:9px 6px}.ag-share{margin-left:auto}.ag-inline-note{font-size:11px;color:#8f99aa;margin-top:8px}
      @media(max-width:480px){.ag-benefits{grid-template-columns:1fr}.ag-strip{grid-template-columns:1fr 1fr 1fr}#amGrowthFeatured .ag-feature{grid-template-columns:78px 1fr}.ag-feature-cover{width:78px}}
    `;document.head.appendChild(style);
  }

  function onboarding(){
    if(localStorage.getItem(STORE.onboarded)==='1'||document.getElementById('amGrowthOnboarding'))return;
    const el=document.createElement('section');el.id='amGrowthOnboarding';el.innerHTML=`<div class="ag-sheet">
      <div class="ag-kicker">AM STUDIO ORIGINALS</div><h2>Stories. Comics.<br>Universes.</h2>
      <p>Satu rumah untuk universe original AM STUDIO. Mulai gratis, simpan yang kamu suka, dan lanjutkan bacaan kapan saja.</p>
      <div class="ag-benefits"><div class="ag-benefit"><b>Original universes</b><br>Release resmi AM STUDIO.</div><div class="ag-benefit"><b>Continue reading</b><br>Progres tersimpan di perangkat.</div><div class="ag-benefit"><b>Collection</b><br>Simpan seri favoritmu.</div></div>
      <div class="ag-actions"><button class="btn" id="agStart">MULAI BACA GRATIS</button><button class="btn ghost" id="agSkip">LEWATI</button></div>
    </div>`;
    document.body.appendChild(el);
    const close=source=>{localStorage.setItem(STORE.onboarded,'1');el.remove();track('onboarding_complete',{source});schedule()};
    el.querySelector('#agStart').onclick=()=>close('start');el.querySelector('#agSkip').onclick=()=>close('skip');
    track('onboarding_view');
  }

  function updateHeader(){
    document.querySelectorAll('.top .tiny,.topbar small').forEach(x=>x.textContent='Stories • Comics • Universes');
    const pill=document.querySelector('.top .pill,.topbar .pill');if(pill&&/PUBLIC READER|PRIVATE BETA/i.test(pill.textContent||'')){pill.textContent='AM STUDIO';pill.style.color='var(--green,#66e3a4)'}
  }

  function updateHome(){
    const active=document.querySelector('[data-tab="home"].active,[data-nav="home"].active');if(!active)return;
    const hero=document.querySelector('.hero');if(!hero)return;
    const eyebrow=hero.querySelector('.eyebrow'),h2=hero.querySelector('h2'),p=hero.querySelector('p');
    if(eyebrow)eyebrow.textContent='AM STUDIO ORIGINALS';
    if(h2)h2.innerHTML='Stories. Comics.<br>Universes.';
    if(p)p.textContent='Baca universe original AM STUDIO dalam satu aplikasi. Mulai gratis, simpan koleksi, dan kembali langsung ke cerita yang belum selesai.';
    const buttons=hero.querySelectorAll('button');if(buttons[0])buttons[0].textContent='MULAI BACA';if(buttons[1])buttons[1].textContent='MY COLLECTION';
    if(!hero.nextElementSibling?.classList?.contains('ag-strip')){
      const strip=document.createElement('div');strip.className='ag-strip';strip.innerHTML='<span>FREE TO START</span><span>OFFICIAL RELEASES</span><span>LOCAL PROGRESS</span>';hero.after(strip);
    }
    renderNewBanner(hero.parentElement||document.querySelector('#app'));
    renderContinue(hero.parentElement||document.querySelector('#app'));
    renderFeatured(hero.parentElement||document.querySelector('#app'));
    document.querySelectorAll('.card .badge').forEach(x=>{if((x.textContent||'').trim()==='PUBLISHED')x.textContent='READ NOW'});
  }

  function renderNewBanner(root){
    if(!root||state.newReleaseCount<1||document.getElementById('amGrowthNew'))return;
    const el=document.createElement('div');el.id='amGrowthNew';el.innerHTML=`<div class="ag-kicker">NEW DROP</div><b>${state.newReleaseCount} release baru tersedia</b><div class="ag-copy">Ada bacaan baru sejak kunjungan terakhir.</div>`;
    const hero=root.querySelector('.hero');(hero?hero.after(el):root.prepend(el));
  }

  function renderContinue(root){
    if(!root||document.getElementById('amGrowthContinue'))return;
    const p=progress();
    const entries=Object.entries(p).filter(([id,n])=>state.ready.has(id)&&Number(n)>0).sort((a,b)=>Number(b[1])-Number(a[1]));
    if(!entries.length)return;
    const [id,n]=entries[0],series=seriesById(id);if(!series)return;
    const ep=Math.min(Number(n),Math.max(...state.ready.get(id)));
    const el=document.createElement('section');el.id='amGrowthContinue';el.innerHTML=`<div class="ag-kicker">CONTINUE READING</div><h3>${series.title}</h3><div class="ag-copy">Lanjut Episode ${String(ep).padStart(2,'0')} dari koleksi progres lokalmu.</div><div class="ag-row"><button class="btn" data-ag-open="${id}" data-ag-episode="${ep}">LANJUTKAN</button></div>`;
    const anchor=root.querySelector('.section');anchor?root.insertBefore(el,anchor):root.appendChild(el);
  }

  function renderFeatured(root){
    if(!root||document.getElementById('amGrowthFeatured'))return;
    const series=firstUnreadSeries();if(!series)return;
    const eps=[...state.ready.get(series.id)].sort((a,b)=>a-b),ep=eps[0];
    const el=document.createElement('section');el.id='amGrowthFeatured';el.innerHTML=`<div class="ag-kicker">FEATURED UNIVERSE</div><div class="ag-feature"><div class="ag-feature-cover" style="background-image:url('/media/comics/${series.id}/cover.jpg')"></div><div><h3>${series.title}</h3><div class="ag-copy">${series.tag||series.genre||'AM STUDIO Original'} • Episode ${String(ep).padStart(2,'0')} tersedia untuk dibaca.</div><div class="ag-row"><button class="btn" data-ag-open="${series.id}" data-ag-episode="${ep}">BACA SEKARANG</button><button class="btn ghost" data-ag-share="${series.id}" data-ag-episode="${ep}">BAGIKAN</button></div></div></div>`;
    const anchor=root.querySelector('.section');anchor?root.insertBefore(el,anchor):root.appendChild(el);
  }

  function currentSeries(){
    const title=(document.querySelector('.universe h2')?.textContent||'').trim();return state.catalog.find(s=>(s.title||'').trim()===title)||seriesById(sessionStorage.getItem('am_current_series'));
  }

  function updateSeries(){
    const universe=document.querySelector('.universe');if(!universe)return;
    const s=currentSeries();if(!s)return;
    universe.querySelectorAll('.badge').forEach(x=>{if(/PUBLISHED|ONGOING|READ NOW/i.test(x.textContent||''))x.textContent='OFFICIAL'});
    const row=universe.querySelector('.row');
    if(row&&!row.querySelector('.ag-share')){const b=document.createElement('button');b.className='btn ghost ag-share';b.dataset.agShare=s.id;b.textContent='BAGIKAN';row.appendChild(b)}
    document.querySelectorAll('.episodes .ep small,.episodes .episode small').forEach(x=>{if(/CANON FINAL|QC PASS|asset audit|Published metadata/i.test(x.textContent||''))x.textContent='Official release • Full reader'});
    document.querySelectorAll('.section .tiny').forEach(x=>{if(/Reader gate active/i.test(x.textContent||''))x.textContent='Official release'});
  }

  function updateReader(){
    const head=document.querySelector('.reader-head');if(!head)return;
    const s=currentSeries();if(!s)return;
    const episode=Number(sessionStorage.getItem('am_current_episode')||0);
    head.querySelectorAll('.eyebrow').forEach(x=>{if(/CANON FINAL|QC PASS/i.test(x.textContent||''))x.textContent='AM STUDIO OFFICIAL'});
    if(!head.querySelector('.ag-share')){const b=document.createElement('button');b.className='btn ghost ag-share';b.dataset.agShare=s.id;if(episode)b.dataset.agEpisode=String(episode);b.textContent='BAGIKAN';head.appendChild(b)}
  }

  function shareUrl(seriesId,episode){
    const u=new URL('/',location.origin);u.searchParams.set('channel','play');u.searchParams.set('series',seriesId);if(episode)u.searchParams.set('episode',String(episode));u.searchParams.set('utm_source','share');u.searchParams.set('utm_medium','app');u.searchParams.set('utm_campaign','organic_share');return u.toString();
  }

  async function share(seriesId,episode){
    const s=seriesById(seriesId);if(!s)return;
    const url=shareUrl(seriesId,episode),text=`Baca ${s.title}${episode?` Episode ${String(episode).padStart(2,'0')}`:''} di AM STUDIO`;
    track('share_intent',{seriesId,episode:episode||null});
    if(/AMStudioAndroid\//.test(navigator.userAgent)){
      location.href=`amstudio-action://share?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;return;
    }
    try{if(navigator.share){await navigator.share({title:s.title,text,url});return}}catch{}
    try{await navigator.clipboard.writeText(`${text}\n${url}`);alert('Link AM STUDIO sudah disalin.')}catch{prompt('Salin link AM STUDIO:',url)}
  }

  function openEpisode(seriesId,episode){
    if(!state.ready.has(seriesId))return;
    sessionStorage.setItem('am_current_series',seriesId);if(episode)sessionStorage.setItem('am_current_episode',String(episode));
    track('content_open',{seriesId,episode:episode||null});
    if(typeof window.openSeries==='function')window.openSeries(seriesId);
    if(episode&&state.ready.get(seriesId)?.has(Number(episode)))setTimeout(()=>{if(typeof window.read==='function')window.read(Number(episode))},140);
  }

  function handleDeepLink(){
    if(state.deepLinkHandled)return;
    const p=new URLSearchParams(location.search),seriesId=p.get('series'),episode=Number(p.get('episode')||0);
    if(!seriesId)return;
    state.deepLinkHandled=true;
    if(state.ready.has(seriesId)){track('deep_link_open',{seriesId,episode:episode||null,campaign:p.get('campaign')||p.get('utm_campaign')||null});setTimeout(()=>openEpisode(seriesId,episode||null),160)}
    else track('deep_link_blocked',{seriesId,episode:episode||null,reason:'NOT_PUBLIC_READY'});
  }

  function updateCollection(){
    const active=document.querySelector('[data-tab="collection"].active,[data-nav="collection"].active');if(!active)return;
    const section=document.querySelector('#app .section');if(section&&!document.getElementById('amGrowthCollectionNote')){const n=document.createElement('div');n.id='amGrowthCollectionNote';n.className='ag-inline-note';n.textContent='Koleksi dan progres tersimpan lokal di perangkat ini.';section.after(n)}
  }

  function updateProfile(){
    const profile=document.getElementById('amNativePublicProfile');if(!profile||profile.querySelector('#amGrowthProfile'))return;
    const box=document.createElement('div');box.className='box';box.id='amGrowthProfile';box.innerHTML='<div class="ag-kicker">AM STUDIO</div><h2>Stories • Comics • Universes</h2><p>Versi publik saat ini fokus pada pengalaman membaca, koleksi, progres, release resmi, dan discovery. Fitur berbayar serta Creator Platform tidak ditampilkan sebelum siap dan lolos review.</p>';
    profile.appendChild(box);
  }

  function bindActions(){
    if(document.documentElement.dataset.amGrowthBound==='1')return;document.documentElement.dataset.amGrowthBound='1';
    document.addEventListener('click',event=>{
      const open=event.target.closest?.('[data-ag-open]');if(open){openEpisode(open.dataset.agOpen,Number(open.dataset.agEpisode||0)||null);return}
      const sh=event.target.closest?.('[data-ag-share]');if(sh){share(sh.dataset.agShare,Number(sh.dataset.agEpisode||0)||null);return}
      const card=event.target.closest?.('.card[data-open],.card[data-series]');if(card){const seriesId=card.dataset.open||card.dataset.series;sessionStorage.setItem('am_current_series',seriesId);track('series_card_open',{seriesId})}
      const ep=event.target.closest?.('.ep[data-ep],.episode[data-episode]');if(ep){const episode=Number(ep.dataset.ep||ep.dataset.episode||0);if(episode)sessionStorage.setItem('am_current_episode',String(episode));track('episode_row_open',{episode})}
    },true);
  }

  function run(){scheduled=false;installStyle();bindActions();updateHeader();updateHome();updateSeries();updateReader();updateCollection();updateProfile()}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(run)}

  captureAttribution();
  installStyle();
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('pageshow',schedule);addEventListener('popstate',schedule);
  loadData().then(()=>{onboarding();handleDeepLink();schedule()});
})();