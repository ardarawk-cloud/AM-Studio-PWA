(()=>{
  // Legacy reader fixes only. Catalog presentation is owned by /index.html.
  // Do not force portrait proportions or two-column desktop grids here.
  const style=document.createElement('style');
  style.textContent=`
    .shell{padding-bottom:150px;scroll-padding-bottom:150px}
    .nav{z-index:9000}
    .grid,.episodes{padding-bottom:18px}
    .comic-stack{margin-bottom:28px}
    .comic-page{display:block;width:100%;height:auto;background:#05070b}
    #am-asset-upload-launch{display:none!important}
    #am-order-fix,#am-order-note{display:none!important}
    @media(max-width:440px){.shell{padding-bottom:130px}}
  `;
  document.head.appendChild(style);

  function applyCovers(){
    document.querySelectorAll('.card[data-open]').forEach(card=>{
      const id=card.dataset.open,cover=card.querySelector('.cover');
      if(!id||!cover||cover.dataset.amCover==='1')return;
      // Published cover or approved catalog asset always wins.
      if(cover.style.backgroundImage.includes('/media/comics/')||cover.dataset.amR2Cover==='1'){
        cover.dataset.amCover='1';return;
      }
      const jpgUrl=`/media/comics/${id}/cover.jpg`;
      const coverUrl=id==='wukong-rebooted'?`/media/comics/${id}/cover.png`:jpgUrl;
      cover.style.backgroundImage=`linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.18)),url('${coverUrl}')`;
      cover.style.backgroundSize='cover';
      cover.style.backgroundPosition='center';
      cover.dataset.amCover='1';
    });
  }
  function freshPages(){
    document.querySelectorAll('img.comic-page').forEach(img=>{
      if(img.dataset.amFresh==='1')return;
      try{const u=new URL(img.getAttribute('src'),location.origin);u.searchParams.set('amfresh',Date.now());img.dataset.amFresh='1';img.src=u.pathname+u.search}catch{}
    });
  }
  let queued=false;
  const apply=()=>{queued=false;applyCovers();freshPages()};
  new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(apply)}).observe(document.body,{childList:true,subtree:true});
  apply();
  document.addEventListener('click',e=>{
    const card=e.target.closest?.('[data-open]');
    if(card?.dataset?.open)sessionStorage.setItem('am_current_series',card.dataset.open);
  },true);
})();