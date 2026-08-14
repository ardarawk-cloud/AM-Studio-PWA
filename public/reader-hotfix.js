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
    #am-order-fix,#am-order-note{display:none!important}
    @media(max-width:390px){.shell{padding-bottom:190px!important}.grid{gap:10px!important}.card .meta{min-height:110px!important}.card .meta b{font-size:14px!important}}
  `;
  document.head.appendChild(style);
  function applyCovers(){
    document.querySelectorAll('.card[data-open]').forEach(card=>{
      const id=card.dataset.open,cover=card.querySelector('.cover');
      if(!id||!cover||cover.dataset.amCover==='1')return;
      const fallback=getComputedStyle(cover).backgroundImage||'linear-gradient(145deg,#273246,#0d1118)';
      const coverUrl=id==='hikayat-pohon-ganja'?'/comics/hikayat-pohon-ganja/cover.jpg?v=20260814hpg1':`/media/comics/${id}/cover.jpg`;
      cover.style.backgroundImage=`linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.08)),url('${coverUrl}'),${fallback}`;
      cover.dataset.amCover='1';
    });
  }
  function freshPages(){
    document.querySelectorAll('img.comic-page').forEach(img=>{
      if(img.dataset.amFresh==='1')return;
      try{const u=new URL(img.getAttribute('src'),location.origin);u.searchParams.set('amfresh',Date.now());img.dataset.amFresh='1';img.src=u.pathname+u.search}catch{}
    });
  }
  const apply=()=>{applyCovers();freshPages()};
  new MutationObserver(apply).observe(document.body,{childList:true,subtree:true});
  apply();
  document.addEventListener('click',e=>{const card=e.target.closest?.('[data-open]');if(card?.dataset?.open)sessionStorage.setItem('am_current_series',card.dataset.open)},true);
})();
