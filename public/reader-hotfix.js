(()=>{
  const style=document.createElement('style');
  style.textContent=`
    .shell{padding-bottom:180px!important;scroll-padding-bottom:180px!important}
    .nav{z-index:9000!important}
    .grid,.episodes{padding-bottom:24px}
    .reader-recovery{margin-bottom:24px}
    .reader-recovery img{display:block;width:100%;height:auto;border-radius:16px;border:1px solid #283142;background:#000}
    @media(max-width:390px){.shell{padding-bottom:190px!important}}
  `;
  document.head.appendChild(style);

  document.addEventListener('click',e=>{
    const card=e.target.closest?.('[data-open]');
    if(card?.dataset?.open)sessionStorage.setItem('am_current_series',card.dataset.open);
  },true);

  const originalRead=window.read;
  window.read=async n=>{
    const id=sessionStorage.getItem('am_current_series');
    if(id!=='amu')return originalRead?.(n);
    try{
      const [catalog,registry]=await Promise.all([
        fetch('/catalog.json?t='+Date.now(),{cache:'no-store'}).then(r=>r.json()),
        fetch('/reader-assets.json?t='+Date.now(),{cache:'no-store'}).then(r=>r.json())
      ]);
      const s=(catalog.series||[]).find(x=>x.id===id);
      const a=(registry.episodes||[]).find(x=>x.seriesId===id&&Number(x.episode)===Number(n));
      if(!s||!a||!a.readerAsset)return originalRead?.(n);
      const progress=JSON.parse(localStorage.getItem('am_progress')||'{}');
      progress[id]=Math.max(progress[id]||0,n);
      localStorage.setItem('am_progress',JSON.stringify(progress));
      const A=document.getElementById('app');
      const title=a.title||s.episodeTitles?.[n-1]||`Episode ${String(n).padStart(2,'0')}`;
      A.innerHTML=`<button class="back" id="backEp">‹ Episodes</button><div class="reader-head"><div><span class="eyebrow">FACEBOOK RECOVERY • OWNER VERIFIED</span><h2>${title}</h2></div><span class="pill">${a.pageCount||16} PAGES</span></div><div class="notice" style="margin-bottom:12px">Recovery asset sementara dari publikasi Facebook. Urutan Page 1–${a.pageCount||16} sudah terkunci dan akan diganti source bersih bila tersedia.</div><div class="reader-recovery"><img src="${a.readerAsset}?v=20260813b" alt="${s.title} Episode ${n} Page 1 sampai ${a.pageCount||16}"></div>`;
      document.getElementById('backEp').onclick=()=>window.openSeries?.(id);
      window.scrollTo({top:0,behavior:'instant'});
    }catch(err){
      console.error('AMU_RECOVERY_READER_HOTFIX_FAILED',err);
      return originalRead?.(n);
    }
  };
})();
