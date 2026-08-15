(()=>{
  if(window.__amPlayReaderV1)return;
  window.__amPlayReaderV1=true;

  const isPlay=()=>document.documentElement.dataset.amDistribution==='play'||new URLSearchParams(location.search).get('channel')==='play';
  if(!isPlay())return;

  let scheduled=false;
  const version=()=>{
    const m=navigator.userAgent.match(/AMStudioAndroid\/([^\s]+)/);
    return m?.[1]||'Play';
  };

  function hideOwnerControls(){
    ['am-admin-launch','am-page-control-launch','am-admin-panel','am-page-control'].forEach(id=>{
      const el=document.getElementById(id);
      if(el)el.style.setProperty('display','none','important');
    });
  }

  function publicBranding(){
    document.title='AM STUDIO — Official Comics Reader';
    document.querySelectorAll('.pill.beta').forEach(el=>{
      el.textContent='OFFICIAL READER';
      el.classList.remove('beta');
      el.style.color='var(--green,#66e3a4)';
    });

    const hero=document.querySelector('.hero');
    if(hero){
      const eyebrow=hero.querySelector('.eyebrow');
      const copy=hero.querySelector('p');
      if(eyebrow)eyebrow.textContent='OFFICIAL COMICS READER';
      if(copy)copy.textContent='Baca universe original AM STUDIO. Reader publik hanya menampilkan episode yang sudah CANON FINAL dan lolos QC.';
    }
  }

  function filterUnreleasedContent(){
    document.querySelectorAll('.card').forEach(card=>{
      const badge=card.querySelector('.badge');
      if(!badge)return;
      const releaseReady=badge.textContent.trim()==='ONGOING';
      card.style.display=releaseReady?'':'none';
    });

    document.querySelectorAll('.ep').forEach(ep=>{
      const detail=ep.querySelector('.epinfo small')?.textContent||'';
      ep.style.display=detail.includes('CANON FINAL')&&detail.includes('QC PASS')?'':'none';
    });

    const episodeList=document.querySelector('.episodes');
    if(episodeList&&!episodeList.querySelector('.ep:not([style*="display: none"])')&&!episodeList.querySelector('#amPlayEpisodeGate')){
      const note=document.createElement('div');
      note.id='amPlayEpisodeGate';
      note.className='notice';
      note.textContent='Belum ada episode publik yang lolos CANON FINAL + QC PASS untuk seri ini.';
      episodeList.appendChild(note);
    }
  }

  function renderPublicProfile(){
    const active=document.querySelector('[data-tab="profile"].active');
    const app=document.getElementById('app');
    if(!active||!app||document.getElementById('amNativePublicProfile'))return;

    app.innerHTML=`
      <div id="amNativePublicProfile">
        <div class="top">
          <div class="brand"><img class="logo" src="/icon.svg" alt="AM STUDIO"><div><h1>AM STUDIO</h1><div class="tiny">Official Comics Reader</div></div></div>
          <span class="pill" style="color:var(--green,#66e3a4)">PLAY READER</span>
        </div>
        <div class="box">
          <span class="eyebrow">ABOUT</span>
          <h2>AM STUDIO Reader</h2>
          <p>Baca komik original AM STUDIO, simpan universe favorit, dan lanjutkan progres bacaan dari perangkat ini.</p>
          <div class="row"><span class="pill">Version ${version()}</span><span class="pill">Reader only</span></div>
        </div>
        <div class="box">
          <b>Privasi</b>
          <p>Favorit dan progres baca disimpan lokal di perangkat. Reader publik tidak memerlukan akun pengguna.</p>
          <p><a class="btn ghost" href="/privacy-policy.html" style="display:inline-block;text-decoration:none">Kebijakan Privasi</a></p>
        </div>
        <div class="box">
          <b>Konten</b>
          <p>AM STUDIO memuat beberapa genre dan tingkat kedewasaan. Sebagian seri dapat berisi horor, kekerasan fantasi, satire, atau tema sejarah/edukasi untuk pembaca yang lebih dewasa. Rating resmi mengikuti klasifikasi Google Play/IARC.</p>
        </div>
        <div class="box">
          <b>Release Policy</b>
          <p>Reader publik hanya menampilkan aset CANON FINAL + QC PASS. Draft produksi, panel Admin, dan alat produksi internal tidak tersedia pada build Play Store.</p>
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
  schedule();
})();
