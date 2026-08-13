(()=>{
  const style=document.createElement('style');
  style.textContent=`
    .shell{padding-bottom:180px!important;scroll-padding-bottom:180px!important}
    .nav{z-index:9000!important}
    .grid,.episodes{padding-bottom:24px}
    .comic-stack{margin-bottom:28px}
    .comic-page{display:block;width:100%;height:auto;background:#05070b}
    .grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important}
    .card{border-radius:20px!important;overflow:hidden!important;background:#0c1118!important}
    .card .cover{height:auto!important;aspect-ratio:2/3!important;padding:0!important;align-items:flex-end!important;background-position:center!important;background-size:cover!important;background-repeat:no-repeat!important}
    .card .cover:after{background:linear-gradient(180deg,transparent 58%,rgba(5,7,11,.82) 100%)!important}
    .card .cover span{font-size:11px!important;line-height:1!important;letter-spacing:.08em!important;padding:7px 9px!important;margin:9px!important;border-radius:999px!important;background:#070a0fbd!important;border:1px solid #ffffff26!important;box-shadow:0 4px 16px #0008!important}
    .card .meta{padding:10px 11px 12px!important;min-height:116px!important}
    .card .meta b{font-size:15px!important;line-height:1.22!important;margin-bottom:5px!important}
    .card .meta small{font-size:10.5px!important;line-height:1.3!important;margin-top:2px!important}
    .card .badge{font-size:8.5px!important;padding:6px 8px!important;margin-top:7px!important;max-width:100%!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
    #am-asset-upload-launch{display:none!important}
    #am-order-fix{width:100%;margin-top:10px;border:1px solid #76501d;background:#241b0d;color:#ffd98a;border-radius:12px;padding:12px;font:850 13px system-ui}
    #am-order-note{font:12px/1.45 system-ui;color:#aeb7c5;margin-top:7px}
    @media(max-width:390px){.shell{padding-bottom:190px!important}.grid{gap:10px!important}.card .meta{min-height:110px!important}.card .meta b{font-size:14px!important}}
  `;
  document.head.appendChild(style);

  function applyCovers(){
    document.querySelectorAll('.card[data-open]').forEach(card=>{
      const id=card.dataset.open,cover=card.querySelector('.cover');
      if(!id||!cover||cover.dataset.amCover==='1')return;
      const fallback=getComputedStyle(cover).backgroundImage||'linear-gradient(145deg,#273246,#0d1118)';
      cover.style.backgroundImage=`linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.08)),url('/media/comics/${id}/cover.jpg'),${fallback}`;
      cover.dataset.amCover='1';
    });
  }

  function bustComicPages(){
    document.querySelectorAll('img.comic-page').forEach(img=>{
      if(img.dataset.amFresh==='1')return;
      try{const u=new URL(img.getAttribute('src'),location.origin);u.searchParams.set('amfresh',Date.now());img.dataset.amFresh='1';img.src=u.pathname+u.search}catch{}
    });
  }

  async function installOrderFix(){
    const panel=document.querySelector('#am-admin-panel');
    if(!panel||panel.querySelector('#am-order-fix'))return;
    const upload=panel.querySelector('#amaUpload'),pages=panel.querySelector('#amaPages'),series=panel.querySelector('#amaSeries'),episode=panel.querySelector('#amaEpisode'),start=panel.querySelector('#amaStart'),total=panel.querySelector('#amaTotal');
    if(!upload||!pages||!series||!episode||!start)return;
    const btn=document.createElement('button');btn.id='am-order-fix';btn.type='button';btn.textContent='↕ BALIK URUTAN PAGE EPISODE';
    const note=document.createElement('div');note.id='am-order-note';note.textContent='Untuk episode yang terlanjur kebalik. Sistem mengambil page yang sudah ada, membalik urutannya, lalu memakai uploader normal untuk menimpa urutan lama.';
    upload.insertAdjacentElement('afterend',note);upload.insertAdjacentElement('afterend',btn);
    btn.onclick=async()=>{
      const sid=series.value,ep=Number(episode.value||1);
      if(!confirm(`Balik urutan semua page ${sid.toUpperCase()} Episode ${ep}?`))return;
      btn.disabled=true;btn.textContent='Membaca page…';
      try{
        const rr=await fetch('/reader-assets.json?t='+Date.now(),{cache:'no-store'});if(!rr.ok)throw new Error('Reader registry gagal dibaca');
        const reg=await rr.json(),asset=(reg.episodes||[]).find(x=>x.seriesId===sid&&Number(x.episode)===ep);
        if(!asset?.pages?.length||asset.pages.length<2)throw new Error('Episode belum punya minimal 2 page');
        const blobs=[];
        for(let i=0;i<asset.pages.length;i++){
          const u=new URL(asset.pages[i],location.origin);u.searchParams.set('orderfix',Date.now()+i);
          const r=await fetch(u,{cache:'reload'});if(!r.ok)throw new Error(`Gagal membaca Page ${i+1}`);blobs.push(await r.blob());
          btn.textContent=`Membaca ${i+1}/${asset.pages.length}…`;
        }
        const dt=new DataTransfer(),rev=[...blobs].reverse();
        rev.forEach((blob,i)=>dt.items.add(new File([blob],`${String(i+1).padStart(3,'0')}.jpg`,{type:blob.type||'image/jpeg'})));
        pages.files=dt.files;start.value='1';if(total&&asset.pageCount)total.value=asset.pageCount;pages.dispatchEvent(new Event('change',{bubbles:true}));
        btn.textContent='Urutan siap dibalik';
        setTimeout(()=>upload.click(),120);
      }catch(e){alert('Gagal membalik urutan: '+(e.message||e));btn.textContent='↕ BALIK URUTAN PAGE EPISODE'}finally{setTimeout(()=>{btn.disabled=false;btn.textContent='↕ BALIK URUTAN PAGE EPISODE'},800)}
    };
  }

  const apply=()=>{applyCovers();bustComicPages();installOrderFix()};
  new MutationObserver(apply).observe(document.body,{childList:true,subtree:true});
  apply();

  document.addEventListener('click',e=>{
    const card=e.target.closest?.('[data-open]');
    if(card?.dataset?.open)sessionStorage.setItem('am_current_series',card.dataset.open);
  },true);
})();
